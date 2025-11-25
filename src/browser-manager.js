const playwright = require('playwright');

class BrowserManager {
  constructor(logger) {
    this.logger = logger;
    this.browser = null;
    this.contexts = new Map();
  }

  async initialize() {
    try {
      this.browser = await playwright.chromium.launch({
        headless: false,
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox'
        ]
      });
      this.logger.info('Browser initialized successfully (visible mode)');
    } catch (error) {
      this.logger.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async getPage(siteName) {
    if (!this.contexts.has(siteName)) {
      const context = await this.browser.newContext({
        viewport: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      // Inject script to mask automation
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false
        });
      });
      
      const page = await context.newPage();
      this.contexts.set(siteName, { context, page });
    }
    return this.contexts.get(siteName).page;
  }

  async close() {
    try {
      for (const [siteName, { context }] of this.contexts) {
        await context.close();
        this.logger.info(`Closed context for ${siteName}`);
      }
      this.contexts.clear();
      if (this.browser) {
        await this.browser.close();
        this.logger.info('Browser closed successfully');
      }
    } catch (error) {
      this.logger.error('Error closing browser:', error);
    }
  }
}

module.exports = { BrowserManager };
