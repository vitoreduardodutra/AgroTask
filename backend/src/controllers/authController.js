const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { verifyGoogleToken } = require('../services/googleAuthService');
const { sendPasswordResetEmail } = require('../services/emailService');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(email) {
  return normalizeText(email).toLowerCase();
}

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generatePasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

  return {
    rawToken,
    hashedToken,
    expiresAt,
  };
}

async function loginWithGoogle(req, res) {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        message: 'Credencial do Google não informada.',
      });
    }

    const googleUser = await verifyGoogleToken(credential);

    if (!googleUser.emailVerified) {
      return res.status(400).json({
        message: 'O e-mail da conta Google não foi verificado.',
      });
    }

    let user = await prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { farm: true },
          take: 1,
        },
      },
    });

    if (!user) {
      user = await prisma.user.findUnique({
        where: { email: googleUser.email },
        include: {
          memberships: {
            where: { status: 'ACTIVE' },
            include: { farm: true },
            take: 1,
          },
        },
      });

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: googleUser.googleId,
            authProvider: 'GOOGLE',
            avatarUrl: googleUser.avatarUrl,
            name: user.name || googleUser.name,
          },
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { farm: true },
              take: 1,
            },
          },
        });
      }
    }

    if (!user) {
      return res.status(404).json({
        message:
          'Nenhuma conta do AgroTask foi encontrada para este Google. Use o cadastro primeiro.',
      });
    }

    const membership = user.memberships?.[0] || null;
    const farm = membership?.farm || null;

    const token = generateToken(user.id);

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: membership?.role || null,
        avatarUrl: user.avatarUrl || null,
      },
      farm,
      membership,
    });
  } catch (error) {
    console.error('Erro no login com Google:', error);

    return res.status(500).json({
      message: 'Não foi possível entrar com Google agora.',
    });
  }
}

async function generateUniqueInviteCode() {
  let inviteCode = generateInviteCode();
  let exists = true;

  while (exists) {
    const farm = await prisma.farm.findUnique({
      where: { inviteCode },
      select: { id: true },
    });

    if (!farm) {
      exists = false;
    } else {
      inviteCode = generateInviteCode();
    }
  }

  return inviteCode;
}

function buildTokenPayload(authData) {
  return {
    sub: authData.user.id,
    email: authData.user.email,
    farmId: authData.farm.id,
    membershipId: authData.membership.id,
    role: authData.membership.role,
  };
}

function buildAuthResponse(authData, token, message) {
  return {
    message,
    token,
    user: {
      id: authData.user.id,
      name: authData.user.name,
      email: authData.user.email,
      status: authData.user.status,
      avatarUrl: authData.user.avatarUrl || null,
    },
    farm: {
      id: authData.farm.id,
      name: authData.farm.name,
      segment: authData.farm.segment,
      inviteCode: authData.farm.inviteCode,
    },
    membership: {
      id: authData.membership.id,
      role: authData.membership.role,
      status: authData.membership.status,
      farmId: authData.farm.id,
    },
  };
}

async function findActiveMembershipByUserId(userId) {
  return prisma.farmMember.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      farm: {
        is: {},
      },
    },
    include: {
      farm: {
        select: {
          id: true,
          name: true,
          segment: true,
          inviteCode: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

async function buildAuthDataFromUserId(userId) {
  const membership = await findActiveMembershipByUserId(userId);

  if (!membership) {
    return null;
  }

  if (membership.user.status !== 'ACTIVE') {
    return null;
  }

  return {
    user: membership.user,
    farm: membership.farm,
    membership: {
      id: membership.id,
      role: membership.role,
      status: membership.status,
    },
  };
}

function signToken(authData) {
  return jwt.sign(
    buildTokenPayload(authData),
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
}

async function registerAdmin(req, res) {
  try {
    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const senha = normalizeText(req.body.senha);
    const confirmarSenha = normalizeText(req.body.confirmarSenha);
    const farmName = normalizeText(req.body.farmName);
    const farmSegment = normalizeText(req.body.farmSegment);

    if (!name || !email || !senha || !confirmarSenha || !farmName || !farmSegment) {
      return res.status(400).json({
        message: 'Todos os campos são obrigatórios.',
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        message: 'A senha deve ter pelo menos 6 caracteres.',
      });
    }

    if (senha !== confirmarSenha) {
      return res.status(400).json({
        message: 'A confirmação de senha não confere.',
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'Já existe um usuário cadastrado com este e-mail.',
      });
    }

    const hashedPassword = await bcrypt.hash(senha, 10);
    const inviteCode = await generateUniqueInviteCode();

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          status: 'ACTIVE',
          authProvider: 'LOCAL',
        },
      });

      const farm = await tx.farm.create({
        data: {
          name: farmName,
          segment: farmSegment,
          inviteCode,
        },
      });

      const membership = await tx.farmMember.create({
        data: {
          userId: user.id,
          farmId: farm.id,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });

      return { user, farm, membership };
    });

    const token = signToken(result);

    return res.status(201).json(
      buildAuthResponse(result, token, 'Cadastro do administrador realizado com sucesso.')
    );
  } catch (error) {
    console.error('Erro ao cadastrar administrador:', error);

    return res.status(500).json({
      message: 'Erro interno ao cadastrar administrador.',
    });
  }
}

async function registerAdminWithGoogle(req, res) {
  try {
    const credential = normalizeText(req.body.credential);
    const farmName = normalizeText(req.body.farmName);
    const farmSegment = normalizeText(req.body.farmSegment);

    if (!credential || !farmName || !farmSegment) {
      return res.status(400).json({
        message: 'Credencial do Google, nome da fazenda e segmento são obrigatórios.',
      });
    }

    const googleUser = await verifyGoogleToken(credential);

    if (!googleUser.emailVerified) {
      return res.status(400).json({
        message: 'O e-mail da conta Google não foi verificado.',
      });
    }

    let existingUser = await prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
      },
    });

    if (!existingUser) {
      existingUser = await prisma.user.findUnique({
        where: { email: googleUser.email },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      });
    }

    if (existingUser && existingUser.status !== 'ACTIVE') {
      return res.status(403).json({
        message: 'Usuário inativo. Não é possível concluir o cadastro com Google.',
      });
    }

    if (existingUser) {
      const activeMembership = await prisma.farmMember.findFirst({
        where: {
          userId: existingUser.id,
          status: 'ACTIVE',
        },
        select: {
          id: true,
        },
      });

      if (activeMembership) {
        return res.status(409).json({
          message: 'Este usuário já está vinculado a uma fazenda ativa.',
        });
      }
    }

    const inviteCode = await generateUniqueInviteCode();

    const result = await prisma.$transaction(async (tx) => {
      let user;

      if (existingUser) {
        user = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            googleId: googleUser.googleId,
            authProvider: 'GOOGLE',
            avatarUrl: googleUser.avatarUrl,
            name: existingUser.name || googleUser.name,
          },
        });
      } else {
        user = await tx.user.create({
          data: {
            name: googleUser.name || googleUser.email.split('@')[0],
            email: googleUser.email,
            password: null,
            googleId: googleUser.googleId,
            authProvider: 'GOOGLE',
            avatarUrl: googleUser.avatarUrl,
            status: 'ACTIVE',
          },
        });
      }

      const farm = await tx.farm.create({
        data: {
          name: farmName,
          segment: farmSegment,
          inviteCode,
        },
      });

      const membership = await tx.farmMember.create({
        data: {
          userId: user.id,
          farmId: farm.id,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });

      return { user, farm, membership };
    });

    const token = signToken(result);

    return res.status(201).json(
      buildAuthResponse(
        result,
        token,
        'Cadastro do administrador com Google realizado com sucesso.'
      )
    );
  } catch (error) {
    console.error('Erro ao cadastrar administrador com Google:', error);

    return res.status(500).json({
      message: 'Erro interno ao cadastrar administrador com Google.',
    });
  }
}

async function registerEmployee(req, res) {
  try {
    const name = normalizeText(req.body.name);
    const email = normalizeEmail(req.body.email);
    const senha = normalizeText(req.body.senha);
    const confirmarSenha = normalizeText(req.body.confirmarSenha);
    const inviteCode = normalizeText(req.body.inviteCode).toUpperCase();

    if (!name || !email || !senha || !confirmarSenha || !inviteCode) {
      return res.status(400).json({
        message: 'Todos os campos são obrigatórios.',
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        message: 'A senha deve ter pelo menos 6 caracteres.',
      });
    }

    if (senha !== confirmarSenha) {
      return res.status(400).json({
        message: 'A confirmação de senha não confere.',
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'Já existe um usuário cadastrado com este e-mail.',
      });
    }

    const farm = await prisma.farm.findUnique({
      where: { inviteCode },
      select: {
        id: true,
        name: true,
        segment: true,
        inviteCode: true,
      },
    });

    if (!farm) {
      return res.status(404).json({
        message: 'Código da fazenda inválido.',
      });
    }

    const hashedPassword = await bcrypt.hash(senha, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          status: 'ACTIVE',
          authProvider: 'LOCAL',
        },
      });

      const membership = await tx.farmMember.create({
        data: {
          userId: user.id,
          farmId: farm.id,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });

      return { user, farm, membership };
    });

    const token = signToken(result);

    return res.status(201).json(
      buildAuthResponse(result, token, 'Cadastro do funcionário realizado com sucesso.')
    );
  } catch (error) {
    console.error('Erro ao cadastrar funcionário:', error);

    return res.status(500).json({
      message: 'Erro interno ao cadastrar funcionário.',
    });
  }
}

async function registerEmployeeWithGoogle(req, res) {
  try {
    const credential = normalizeText(req.body.credential);
    const inviteCode = normalizeText(req.body.inviteCode).toUpperCase();

    if (!credential || !inviteCode) {
      return res.status(400).json({
        message: 'Credencial do Google e código da fazenda são obrigatórios.',
      });
    }

    const googleUser = await verifyGoogleToken(credential);

    if (!googleUser.emailVerified) {
      return res.status(400).json({
        message: 'O e-mail da conta Google não foi verificado.',
      });
    }

    const farm = await prisma.farm.findUnique({
      where: { inviteCode },
      select: {
        id: true,
        name: true,
        segment: true,
        inviteCode: true,
      },
    });

    if (!farm) {
      return res.status(404).json({
        message: 'Código da fazenda inválido.',
      });
    }

    let existingUser = await prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
      },
    });

    if (!existingUser) {
      existingUser = await prisma.user.findUnique({
        where: { email: googleUser.email },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      });
    }

    if (existingUser && existingUser.status !== 'ACTIVE') {
      return res.status(403).json({
        message: 'Usuário inativo. Não é possível concluir o cadastro com Google.',
      });
    }

    if (existingUser) {
      const activeMembership = await prisma.farmMember.findFirst({
        where: {
          userId: existingUser.id,
          status: 'ACTIVE',
        },
        include: {
          farm: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (activeMembership) {
        if (activeMembership.farmId === farm.id) {
          return res.status(409).json({
            message: 'Este usuário já está vinculado a esta fazenda.',
          });
        }

        return res.status(409).json({
          message: 'Este usuário já está vinculado a uma fazenda ativa.',
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let user;

      if (existingUser) {
        user = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            googleId: googleUser.googleId,
            authProvider: 'GOOGLE',
            avatarUrl: googleUser.avatarUrl,
            name: existingUser.name || googleUser.name,
          },
        });
      } else {
        user = await tx.user.create({
          data: {
            name: googleUser.name || googleUser.email.split('@')[0],
            email: googleUser.email,
            password: null,
            googleId: googleUser.googleId,
            authProvider: 'GOOGLE',
            avatarUrl: googleUser.avatarUrl,
            status: 'ACTIVE',
          },
        });
      }

      const membership = await tx.farmMember.create({
        data: {
          userId: user.id,
          farmId: farm.id,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      });

      return { user, farm, membership };
    });

    const token = signToken(result);

    return res.status(201).json(
      buildAuthResponse(
        result,
        token,
        'Cadastro do funcionário com Google realizado com sucesso.'
      )
    );
  } catch (error) {
    console.error('Erro ao cadastrar funcionário com Google:', error);

    return res.status(500).json({
      message: 'Erro interno ao cadastrar funcionário com Google.',
    });
  }
}

async function login(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    const senha = normalizeText(req.body.senha || req.body.password);

    if (!email || !senha) {
      return res.status(400).json({
        message: 'Email e senha são obrigatórios.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        status: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        message: 'Credenciais inválidas.',
      });
    }

    if (!user.password) {
      return res.status(401).json({
        message: 'Esta conta foi criada com Google. Use o botão Entrar com Google.',
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        message: 'Usuário inativo.',
      });
    }

    const passwordIsValid = await bcrypt.compare(senha, user.password);

    if (!passwordIsValid) {
      return res.status(401).json({
        message: 'Credenciais inválidas.',
      });
    }

    const authData = await buildAuthDataFromUserId(user.id);

    if (!authData) {
      return res.status(403).json({
        message: 'Usuário sem vínculo ativo com uma fazenda.',
      });
    }

    const token = signToken(authData);

    return res.status(200).json(
      buildAuthResponse(authData, token, 'Login realizado com sucesso.')
    );
  } catch (error) {
    console.error('Erro ao fazer login:', error);

    return res.status(500).json({
      message: 'Erro interno ao fazer login.',
    });
  }
}

async function forgotPassword(req, res) {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({
        message: 'E-mail é obrigatório.',
      });
    }

    const genericMessage =
      'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.';

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      return res.status(200).json({
        message: genericMessage,
      });
    }

    const { rawToken, hashedToken, expiresAt } = generatePasswordResetToken();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: expiresAt,
      },
    });

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/reset-password/${rawToken}`;

      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      });
    } catch (emailError) {
      console.error('Erro ao enviar e-mail de recuperação:', emailError);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: null,
          passwordResetExpiresAt: null,
        },
      });
    }

    return res.status(200).json({
      message: genericMessage,
    });
  } catch (error) {
    console.error('Erro ao solicitar recuperação de senha:', error);

    return res.status(500).json({
      message: 'Erro interno ao solicitar recuperação de senha.',
    });
  }
}

async function resetPassword(req, res) {
  try {
    const token = normalizeText(req.body.token);
    const senha = normalizeText(req.body.senha);
    const confirmarSenha = normalizeText(req.body.confirmarSenha);

    if (!token || !senha || !confirmarSenha) {
      return res.status(400).json({
        message: 'Token, senha e confirmação de senha são obrigatórios.',
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        message: 'A senha deve ter pelo menos 6 caracteres.',
      });
    }

    if (senha !== confirmarSenha) {
      return res.status(400).json({
        message: 'A confirmação de senha não confere.',
      });
    }

    const hashedToken = hashResetToken(token);

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        googleId: true,
      },
    });

    if (!user) {
      return res.status(400).json({
        message: 'O link de recuperação é inválido ou expirou.',
      });
    }

    const hashedPassword = await bcrypt.hash(senha, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        authProvider: user.googleId ? 'GOOGLE' : 'LOCAL',
      },
    });

    return res.status(200).json({
      message: 'Senha redefinida com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);

    return res.status(500).json({
      message: 'Erro interno ao redefinir senha.',
    });
  }
}

async function getMe(req, res) {
  try {
    const authData = await buildAuthDataFromUserId(req.user.id);

    if (!authData) {
      return res.status(403).json({
        message: 'Usuário sem vínculo ativo com uma fazenda.',
      });
    }

    return res.status(200).json({
      message: 'Sessão carregada com sucesso.',
      user: {
        id: authData.user.id,
        name: authData.user.name,
        email: authData.user.email,
        status: authData.user.status,
        avatarUrl: authData.user.avatarUrl || null,
      },
      farm: {
        id: authData.farm.id,
        name: authData.farm.name,
        segment: authData.farm.segment,
        inviteCode: authData.farm.inviteCode,
      },
      membership: {
        id: authData.membership.id,
        role: authData.membership.role,
        status: authData.membership.status,
        farmId: authData.farm.id,
      },
    });
  } catch (error) {
    console.error('Erro ao carregar sessão:', error);

    return res.status(500).json({
      message: 'Erro interno ao carregar sessão.',
    });
  }
}

module.exports = {
  login,
  registerAdmin,
  registerAdminWithGoogle,
  registerEmployee,
  registerEmployeeWithGoogle,
  getMe,
  loginWithGoogle,
  forgotPassword,
  resetPassword,
};
