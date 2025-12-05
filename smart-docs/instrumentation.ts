export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeServices } = await import('./server/services');
    const { getServerConfig } = await import('./server/config');

    try {
      const config = getServerConfig();
      initializeServices(config);
    } catch (error) {
      console.error('Failed to initialize services:', error);
    }
  }
}
