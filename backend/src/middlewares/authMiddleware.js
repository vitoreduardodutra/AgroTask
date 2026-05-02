const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

function getDecodedUserId(decodedToken) {
  const possibleIds = [decodedToken?.id, decodedToken?.sub];
  const validId = possibleIds.find((value) => Number.isInteger(Number(value)));

  return validId ? Number(validId) : null;
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: 'Token não informado.',
      });
    }

    const [, token] = authHeader.split(' ');

    if (!token) {
      return res.status(401).json({
        message: 'Token inválido.',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = getDecodedUserId(decoded);

    if (!userId) {
      return res.status(401).json({
        message: 'Token invalido.',
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        memberships: {
          where: {
            status: 'ACTIVE',
          },
          select: {
            id: true,
            role: true,
            status: true,
            farmId: true,
            farm: {
              select: {
                id: true,
                name: true,
                segment: true,
                inviteCode: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({
        message: 'Usuário do token não encontrado.',
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        message: 'Usuário inativo.',
      });
    }

    const membership = user.memberships[0];

    if (!membership) {
      return res.status(403).json({
        message: 'Usuário sem vínculo ativo com uma fazenda.',
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      membershipId: membership.id,
      role: membership.role,
      farmId: membership.farmId,
      farm: membership.farm,
      membership: {
        id: membership.id,
        role: membership.role,
        status: membership.status,
        farmId: membership.farmId,
      },
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: 'Token inválido ou expirado.',
    });
  }
}

module.exports = authMiddleware;
