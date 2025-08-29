const { chromium } = require('playwright');

class BrowserManager {
  constructor(logger) {
    this.logger = logger;
    this.browser = null;
    this.pages = new Map();
  }

  async initialize() {
    try {
      this.browser = await chromium.launch({
        headless: process.env.NODE_ENV === 'production',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
      this.logger.info('Browser initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async getPage(siteName) {
    if (!this.pages.has(siteName)) {
      // Tạo context với userAgent
      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1280, height: 720 }
      });
      const page = await context.newPage();
      this.pages.set(siteName, page);
    }
    return this.pages.get(siteName);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.pages.clear();
    }
  }
}

module.exports = { BrowserManager };
