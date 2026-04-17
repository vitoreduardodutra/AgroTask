const API_BASE_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:3001'
).replace(/\/$/, '');

const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 4500;

const listeners = new Set();

let monitoringConsumers = 0;
let heartbeatIntervalId = null;
let activeCheckPromise = null;

const hasNavigator = typeof navigator !== 'undefined';
const browserInitiallyOnline = hasNavigator ? navigator.onLine : true;

let connectivityState = {
  isOnline: browserInitiallyOnline,
  isChecking: false,
  lastCheckedAt: null,
  source: browserInitiallyOnline ? 'browser-initial' : 'browser-initial-offline',
};

function getNowIso() {
  return new Date().toISOString();
}

function emitState() {
  const snapshot = { ...connectivityState };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('Erro ao notificar listener de conectividade:', error);
    }
  });
}

function setConnectivityState(partialState) {
  const nextState = {
    ...connectivityState,
    ...partialState,
  };

  const changed =
    nextState.isOnline !== connectivityState.isOnline ||
    nextState.isChecking !== connectivityState.isChecking ||
    nextState.lastCheckedAt !== connectivityState.lastCheckedAt ||
    nextState.source !== connectivityState.source;

  connectivityState = nextState;

  if (changed) {
    emitState();
  }
}

function buildHeartbeatUrl() {
  return `${API_BASE_URL}/?__agrotask_ping=${Date.now()}`;
}

export function getConnectivitySnapshot() {
  return { ...connectivityState };
}

export function subscribeToConnectivity(listener) {
  listeners.add(listener);
  listener(getConnectivitySnapshot());

  return () => {
    listeners.delete(listener);
  };
}

export function markOnline(source = 'manual') {
  setConnectivityState({
    isOnline: true,
    isChecking: false,
    lastCheckedAt: getNowIso(),
    source,
  });
}

export function markOffline(source = 'manual') {
  setConnectivityState({
    isOnline: false,
    isChecking: false,
    lastCheckedAt: getNowIso(),
    source,
  });
}

export async function checkConnectivityNow(options = {}) {
  const { silent = false } = options;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    markOffline('browser-offline');
    return getConnectivitySnapshot();
  }

  if (activeCheckPromise) {
    return activeCheckPromise;
  }

  if (!silent) {
    setConnectivityState({
      isChecking: true,
      source: 'heartbeat-start',
    });
  }

  activeCheckPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, HEARTBEAT_TIMEOUT_MS);

    try {
      await fetch(buildHeartbeatUrl(), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'X-AgroTask-Connectivity-Check': 'true',
        },
      });

      markOnline('heartbeat-success');
      return getConnectivitySnapshot();
    } catch (error) {
      markOffline('heartbeat-failed');
      return getConnectivitySnapshot();
    } finally {
      window.clearTimeout(timeoutId);
      activeCheckPromise = null;
    }
  })();

  return activeCheckPromise;
}

function handleBrowserOnline() {
  markOnline('browser-online');
  void checkConnectivityNow();
}

function handleBrowserOffline() {
  markOffline('browser-offline');
}

export function startConnectivityMonitoring() {
  monitoringConsumers += 1;

  if (monitoringConsumers > 1) {
    return;
  }

  window.addEventListener('online', handleBrowserOnline);
  window.addEventListener('offline', handleBrowserOffline);

  heartbeatIntervalId = window.setInterval(() => {
    void checkConnectivityNow({ silent: true });
  }, HEARTBEAT_INTERVAL_MS);

  void checkConnectivityNow();
}

export function stopConnectivityMonitoring() {
  monitoringConsumers = Math.max(0, monitoringConsumers - 1);

  if (monitoringConsumers > 0) {
    return;
  }

  window.removeEventListener('online', handleBrowserOnline);
  window.removeEventListener('offline', handleBrowserOffline);

  if (heartbeatIntervalId) {
    window.clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}