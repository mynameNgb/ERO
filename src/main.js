const { BrowserManager } = require('./browser-manager');
const { DataWatcher } = require('./data-watcher');
const { ActionExecutor } = require('./action-executor');
const { Logger } = require('./logger');
const config = require('../config/sites.json');

class WebAutomationSystem {
  constructor() {
    this.logger = new Logger();
    this.browserManager = new BrowserManager(this.logger);
    this.actionExecutor = new ActionExecutor(this.logger);
    this.dataWatcher = new DataWatcher(this.logger);
    this.isRunning = false;
  }

  async initialize() {
    try {
      this.logger.info('Initializing Web Automation System...');
      await this.browserManager.initialize();
      this.dataWatcher.onDataChange((data) => {
        this.processRealtimeData(data);
      });
      this.dataWatcher.startWatching();
      this.logger.info('System initialized successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize system:', error);
      return false;
    }
  }

  async processRealtimeData(data) {
    if (!this.isRunning) {
      this.isRunning = true;
      try {
        for (const siteConfig of config.sites) {
          if (this.shouldProcessSite(siteConfig, data)) {
            await this.processSite(siteConfig, data);
          }
        }
      } catch (error) {
        this.logger.error('Error processing realtime data:', error);
      } finally {
        this.isRunning = false;
      }
    }
  }

  shouldProcessSite(siteConfig, data) {
    if (siteConfig.conditions) {
      return siteConfig.conditions.some(condition => {
        return this.evaluateCondition(condition, data);
      });
    }
    return true;
  }

  evaluateCondition(condition, data) {
    try {
      const func = new Function('data', `return ${condition}`);
      return func(data);
    } catch (error) {
      this.logger.error('Error evaluating condition:', error);
      return false;
    }
  }

  async processSite(siteConfig, data) {
    try {
      this.logger.info(`Processing site: ${siteConfig.name}`);
      const page = await this.browserManager.getPage(siteConfig.name);
      if (page.url() !== siteConfig.url) {
        await page.goto(siteConfig.url);
        await page.waitForLoadState('networkidle');
      }
      // Bỏ qua kiểm tra đăng nhập, luôn thực hiện actions
      await this.actionExecutor.executeActions(page, siteConfig.actions, data);
      this.logger.info(`Successfully processed site: ${siteConfig.name}`);
    } catch (error) {
      this.logger.error(`Error processing site ${siteConfig.name}:`, error);
    }
  }

  async checkLoginStatus(page, siteConfig) {
    try {
      if (siteConfig.login_check_selector) {
        const element = await page.$(siteConfig.login_check_selector);
        return element !== null;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async performLogin(page, siteConfig) {
    try {
      this.logger.info(`Performing login for ${siteConfig.name}`);
      const { username, password } = siteConfig.credentials;
      const selectors = siteConfig.selectors;
      await page.waitForSelector(selectors.username_field);
      await page.fill(selectors.username_field, username);
      await page.fill(selectors.password_field, password);
      await page.click(selectors.login_button);
      await page.waitForLoadState('networkidle');
      this.logger.info(`Login successful for ${siteConfig.name}`);
    } catch (error) {
      this.logger.error(`Login failed for ${siteConfig.name}:`, error);
      throw error;
    }
  }

  async shutdown() {
    this.logger.info('Shutting down Web Automation System...');
    this.dataWatcher.stopWatching();
    await this.browserManager.close();
    this.logger.info('System shutdown complete');
  }
}

async function main() {
  const system = new WebAutomationSystem();
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await system.shutdown();
    process.exit(0);
  });
  const initialized = await system.initialize();
  if (initialized) {
    console.log('Web Automation System is running...');
    // Đọc mảng dữ liệu
    const testDataArr = require('../data/realtime-data.json');
    const accounts = require('../config/accounts.json');
    // Gom nhóm theo DEPOT
    const grouped = {};
    for (const item of testDataArr) {
      if (!grouped[item.DEPOT]) grouped[item.DEPOT] = [];
      grouped[item.DEPOT].push(item);
    }
    const siteConfig = config.sites[0];
    for (const depot in grouped) {
      // Tạo context và page mới cho mỗi Depot
      const playwright = require('playwright');
      const context = await system.browserManager.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1280, height: 720 }
      });
      const page = await context.newPage();
      // Lấy account
      const account = accounts[depot];
      if (!account) {
        console.error(`No account found for DEPOT ${depot}`);
        continue;
      }
      // Chuẩn bị data login
      const loginData = {
        account,
        ...grouped[depot][0] // lấy các trường chung
      };
      // Truy cập trang login
      await page.goto(siteConfig.url);
      await page.waitForLoadState('networkidle');
      // Thực hiện login (các action trừ bước 6)
      for (let i = 0; i < siteConfig.actions.length; i++) {
        const action = siteConfig.actions[i];
        if (action.selector === '#releaseOrderNumber' || action.selector === '#btn_ValidateRO') break;
        await system.actionExecutor.executeAction(page, action, loginData);
        if (action.delay) await page.waitForTimeout(action.delay);
      }
      // Lặp qua từng releaseOrderNumber cho Depot này
      for (const item of grouped[depot]) {
        const roData = {
          account,
          ...item
        };
        // Bước 6: nhập releaseOrderNumber và validate
        for (let i = 0; i < siteConfig.actions.length; i++) {
          const action = siteConfig.actions[i];
          if (action.selector === '#releaseOrderNumber' || action.selector === '#btn_ValidateRO') {
            await system.actionExecutor.executeAction(page, action, roData);
            if (action.selector === '#btn_ValidateRO') {
              await page.waitForTimeout(5000); // Delay 5s sau khi validate
            } else if (action.delay) {
              await page.waitForTimeout(action.delay);
            }
          }
        }
      }
      // Logout
      await system.actionExecutor.executeAction(page, { type: 'click', selector: '.btn.btn-logout.logout-btn', delay: 1000 }, loginData);
      await page.waitForTimeout(1000);
      await context.close(); // Đóng context và page sau khi xong Depot
    }
    console.log('Automation finished. Browser will remain open for manual inspection.');
  } else {
    console.error('Failed to initialize system');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { WebAutomationSystem };
