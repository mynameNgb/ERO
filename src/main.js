const { BrowserManager } = require('./browser-manager');
const { DataWatcher } = require('./data-watcher');
const { ActionExecutor } = require('./action-executor');
const { Logger } = require('./logger');
const { ApiService } = require('./api-service');
const config = require('../config/sites.json');
const apiConfig = require('../config/api-config.json');

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

  async checkAndHandlePopup(page) {
    try {
      // Kiểm tra popup Success
      const successPopup = await page.$('#popup-Success');
      if (successPopup) {
        const display = await successPopup.evaluate(el => window.getComputedStyle(el).display);
        if (display === 'block') {
          const message = await page.$eval('#spn_SuccessMessage', el => el.textContent).catch(() => 'N/A');
          this.logger.info(`Success Popup: ${message}`);
          console.log(`✓ Success: ${message}`);
          await page.click('#btn_SuccessPopupClose').catch(() => {});
          return 'success';
        }
      }

      // Kiểm tra popup Error
      const errorPopup = await page.$('#popup-Error');
      if (errorPopup) {
        const display = await errorPopup.evaluate(el => window.getComputedStyle(el).display);
        if (display === 'block') {
          const message = await page.$eval('#p_ErrorPopupMessage', el => el.textContent).catch(() => 'N/A');
          this.logger.error(`Error Popup: ${message}`);
          console.log(`✗ Error: ${message}`);
          await page.click('#btn_ErrorPopupClose').catch(() => {});
          return 'error';
        }
      }

      // Kiểm tra popup Warning
      const warnPopup = await page.$('#popup-Warn');
      if (warnPopup) {
        const display = await warnPopup.evaluate(el => window.getComputedStyle(el).display);
        if (display === 'block') {
          const message = await page.$eval('#p_WarningPopupMessage', el => el.textContent).catch(() => 'N/A');
          this.logger.warn(`Warning Popup: ${message}`);
          console.log(`⚠ Warning: ${message}`);
          await page.click('#btn_WarnPopupClose').catch(() => {});
          return 'warning';
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Error checking popup:', error);
      return null;
    }
  }

  normalizeDataItem(item) {
    // Chuẩn hóa format data: lấy giá trị 'v' nếu có, nếu không thì giữ nguyên
    const normalized = {};
    for (const key in item) {
      if (item[key] && typeof item[key] === 'object' && 'v' in item[key]) {
        normalized[key] = item[key].v;
      } else {
        normalized[key] = item[key];
      }
    }
    return normalized;
  }

  groupByDepot(dataArray) {
    var grouped = {};
    for (const item of dataArray) {
      var normalizedItem = this.normalizeDataItem(item);
      var depot = normalizedItem.DEPOT;
      
      if (!depot) {
        this.logger.warn('Item missing DEPOT field, skipping:', item);
        continue;
      }
      
      if (!grouped[depot]) {
        grouped[depot] = [];
      }
      grouped[depot].push(normalizedItem);
    }
    
    this.logger.info(`Grouped data by DEPOT: ${Object.keys(grouped).join(', ')}`);
    return grouped;
  }

  async saveGroupedDataToFile(grouped) {
    const fs = require('fs-extra');
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const dataDir = path.join(__dirname, '../data');
    await fs.ensureDir(dataDir);
    
    const groupedFile = path.join(dataDir, `grouped-${timestamp}.json`);
    
    // Tính tổng số item cho mỗi depot
    const summary = {};
    for (const depot in grouped) {
      summary[depot] = grouped[depot].length;
    }
    
    await fs.writeJson(groupedFile, {
      timestamp: new Date().toISOString(),
      summary: summary,
      data: grouped
    }, { spaces: 2 });
    
    this.logger.info(`Grouped data saved to: ${groupedFile}`);
    console.log(`📁 Grouped data saved: ${groupedFile}`);
    
    return groupedFile;
  }

  async initResultFiles() {
    const fs = require('fs-extra');
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const resultsDir = path.join(__dirname, '../results');
    await fs.ensureDir(resultsDir);
    
    const successFile = path.join(resultsDir, `success-${timestamp}.json`);
    const failedFile = path.join(resultsDir, `failed-${timestamp}.json`);
    
    // Khởi tạo file rỗng
    await fs.writeJson(successFile, { timestamp: new Date().toISOString(), total: 0, data: [] }, { spaces: 2 });
    await fs.writeJson(failedFile, { timestamp: new Date().toISOString(), total: 0, data: [] }, { spaces: 2 });
    
    return { successFile, failedFile };
  }

  async appendFailedToFile(failedFile, failedItem) {
    const fs = require('fs-extra');
    try {
      const content = await fs.readJson(failedFile);
      content.data.push(failedItem);
      content.total = content.data.length;
      await fs.writeJson(failedFile, content, { spaces: 2 });
      this.logger.info(`Failed item appended: ${failedItem.releaseOrderNumber}`);
    } catch (error) {
      this.logger.error('Error appending failed item:', error);
    }
  }

  async getFailedROs(failedFile) {
    const fs = require('fs-extra');
    try {
      const content = await fs.readJson(failedFile);
      return content.data.map(item => item.releaseOrderNumber);
    } catch (error) {
      this.logger.error('Error reading failed file:', error);
      return [];
    }
  }

  async saveSuccessToFile(successFile, successList) {
    const fs = require('fs-extra');
    await fs.writeJson(successFile, {
      timestamp: new Date().toISOString(),
      total: successList.length,
      data: successList
    }, { spaces: 2 });
    this.logger.info(`Success file updated: ${successList.length} items`);
  }

  async printResultSummary(successFile, failedFile, successList) {
    const fs = require('fs-extra');
    const failedContent = await fs.readJson(failedFile);
    
    console.log(`\n📊 Results saved:`);
    console.log(`   ✓ Success: ${successFile}`);
    console.log(`   ✗ Failed: ${failedFile}`);
    console.log(`\n✅ Automation finished. Browser will remain open for manual inspection.`);
    console.log(`   Total processed: ${successList.length + failedContent.total}`);
    console.log(`   Success: ${successList.length}`);
    console.log(`   Failed: ${failedContent.total}`);
  }

  async shutdown() {
    this.logger.info('Shutting down Web Automation System...');
    this.dataWatcher.stopWatching();
    await this.browserManager.close();
    this.logger.info('System shutdown complete');
  }

  async fetchDataWithRetry(apiService, maxRetries = 3) {
    let testDataArr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Attempt ${attempt}/${maxRetries} to get data from API...`);
      testDataArr = await apiService.getReleaseOrderData();
      if (testDataArr && testDataArr.data) {
        break;
      }
      if (attempt < maxRetries) {
        console.log(`Retrying in 10 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    return testDataArr;
  }

  async processLogin(page, siteConfig, loginData) {
    for (let i = 0; i < siteConfig.actions.length; i++) {
      const action = siteConfig.actions[i];
      if (action.typeAction !== 'login') continue;
      await this.actionExecutor.executeAction(page, action, loginData);
      if (action.delay) await page.waitForTimeout(action.delay);
      await this.checkAndHandlePopup(page);
    }
  }

  async processReleaseOrder(page, siteConfig, roData, failedFile, successList, depot) {
    const roNumber = roData.releaseOrderNumber || 'N/A';
    const roID = roData.ID || '-1';
    let actionFailed = false;
    let errorReason = '';
    
    for (let i = 0; i < siteConfig.actions.length; i++) {
      const action = siteConfig.actions[i];
      if (action.typeAction !== 'roData') continue;
      
      try {
        await this.actionExecutor.executeAction(page, action, roData);
        if (action.delay) {
          await page.waitForTimeout(action.delay);
        }
        
        const checkpopup = await this.checkAndHandlePopup(page);
        if (checkpopup === 'error' || checkpopup === 'warning') {
          actionFailed = true;
          errorReason = `Popup ${checkpopup} detected`;
          break;
        }
      } catch (error) {
        this.logger.error(`Action failed for RO ${roNumber}, skipping to next RO`);
        console.error(`⚠ Skipping RO ${roNumber} due to action failure`);
        actionFailed = true;
        errorReason = error.message || 'Action execution failed';
        break;
      }
    }
    
    if (actionFailed) {
      const failedItem = {
        depot,
        releaseOrderID: roID,
        releaseOrderNumber: roNumber,
        reason: errorReason,
        timestamp: new Date().toISOString()
      };
      await this.appendFailedToFile(failedFile, failedItem);
      console.log(`🔴 Failed saved: ${roNumber}`);
    } else {
      successList.push({
        depot,
        releaseOrderID: roID,
        releaseOrderNumber: roNumber,
        timestamp: new Date().toISOString()
      });
    }
  }

  async markRemainingAsFailed(grouped, depot, failedFile, successList) {
    const processedROs = new Set([
      ...successList.map(s => s.releaseOrderNumber),
      ...await this.getFailedROs(failedFile)
    ]);
    
    for (const item of grouped[depot]) {
      const roNumber = item.releaseOrderNumber || 'N/A';
      if (!processedROs.has(roNumber)) {
        const failedItem = {
          depot,
          releaseOrderID: item.ID || '-1',
          releaseOrderNumber: roNumber,
          reason: 'Browser/Page closed unexpectedly',
          timestamp: new Date().toISOString()
        };
        await this.appendFailedToFile(failedFile, failedItem);
        console.log(`🔴 Failed saved (browser closed): ${roNumber}`);
      }
    }
  }

  async processDepot(depot, grouped, accounts, siteConfig, page, context, failedFile, successList) {
    const account = accounts[depot];
    if (!account) {
      console.error(`No account found for DEPOT ${depot}`);
      for (const item of grouped[depot]) {
        const failedItem = {
          depot,
          releaseOrderID: item.ID || '-1',
          releaseOrderNumber: item.releaseOrderNumber || 'N/A',
          reason: 'No account configured for depot',
          timestamp: new Date().toISOString()
        };
        await this.appendFailedToFile(failedFile, failedItem);
      }
      return;
    }
    
    const loginData = {
      account,
      ...grouped[depot][0]
    };
    
    await page.goto(siteConfig.url);
    await page.waitForLoadState('networkidle');
    
    await this.processLogin(page, siteConfig, loginData);
    
    for (const item of grouped[depot]) {
      const roData = {
        account,
        ...item
      };
      await this.processReleaseOrder(page, siteConfig, roData, failedFile, successList, depot);
    }
    
    await page.waitForTimeout(1000);
    await this.actionExecutor.executeAction(page, { type: 'click', selector: '.btn.btn-logout.logout-btn', delay: 1000 }, loginData);
    await page.waitForTimeout(1000);
  }
}

async function main() {
  const system = new WebAutomationSystem();
  
  // Khởi tạo API Service nếu enabled
  let apiService = null;
  if (apiConfig.enabled) {
    apiService = new ApiService(system.logger, apiConfig.apiUrl);
  }
  
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    if (apiService) {
      apiService.stopAutoUpdate();
    }
    await system.shutdown();
    process.exit(0);
  });
  
  const initialized = await system.initialize();
  if (!initialized) {
    console.error('Failed to initialize system');
    process.exit(1);
  }
  
  console.log('Web Automation System is running...');
  
  // Lấy dữ liệu từ API
  if (!apiConfig.enabled || !apiService) {
    console.error('API service is disabled. System will wait for next API call.');
    return;
  }
  
  // Function xử lý automation
  const processAutomation = async () => {
    console.log('\n🔄 Starting automation cycle...');
    
    const testDataArr = await system.fetchDataWithRetry(apiService, 3);
    
    if (!testDataArr || !testDataArr.data) {
      console.error('❌ Failed to get data after 3 attempts. Will retry in next cycle.');
      return;
    }
    
    if (testDataArr.data.length === 0) {
      console.log('ℹ️ No data to process. Will retry in next cycle.');
      return;
    }
    
    const accounts = require('../config/accounts.json');
    const grouped = system.groupByDepot(testDataArr.data);
    await system.saveGroupedDataToFile(grouped);
    
    const siteConfig = config.sites[0];
    const { successFile, failedFile } = await system.initResultFiles();
    const successList = [];
    
    for (const depot in grouped) {
      const playwright = require('playwright');
      const context = await system.browserManager.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1280, height: 720 }
      });
      const page = await context.newPage();
      
      try {
        await system.processDepot(depot, grouped, accounts, siteConfig, page, context, failedFile, successList);
      } catch (error) {
        if (error.message && (error.message.includes('Target page, context or browser has been closed') || 
            error.message.includes('Target closed') || 
            error.message.includes('Browser has been closed'))) {
          
          system.logger.error(`Browser/Page closed unexpectedly for DEPOT ${depot}`);
          console.error(`❌ Browser closed for DEPOT ${depot}. Saving progress and marking remaining ROs as failed.`);
          
          await system.saveSuccessToFile(successFile, successList);
          await system.markRemainingAsFailed(grouped, depot, failedFile, successList);
          
          try {
            await context.close();
          } catch (e) {
            // Ignore
          }
          
          console.log('⏸️ Stopping current cycle due to browser closure. Will retry in next cycle.');
          break;
        }
        
        system.logger.error(`Error processing DEPOT ${depot}:`, error);
        console.error(`❌ Error processing DEPOT ${depot}: ${error.message}`);
        
        for (const item of grouped[depot]) {
          const failedItem = {
            depot,
            releaseOrderID: item.ID || '-1',
            releaseOrderNumber: item.releaseOrderNumber || 'N/A',
            reason: `Depot processing error: ${error.message}`,
            timestamp: new Date().toISOString()
          };
          await system.appendFailedToFile(failedFile, failedItem);
        }
      } finally {
        try {
          await context.close();
        } catch (e) {
          // Ignore
        }
      }
    }
    
    await system.saveSuccessToFile(successFile, successList);
    await system.printResultSummary(successFile, failedFile, successList);
  };
  
  // Function setup interval để chạy lại mỗi 15 phút
  const setupAutoRun = () => {
    const intervalMinutes = apiConfig.updateIntervalMinutes || 15;
    const intervalMs = intervalMinutes * 60 * 1000;
    
    // Setup countdown timer (hiển thị mỗi 3 phút)
    let timeRemaining = intervalMinutes * 60; // seconds
    const countdownInterval = setInterval(() => {
      timeRemaining -= 180; // Giảm 3 phút (180 giây)
      
      if (timeRemaining > 0) {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        console.log(`⏳ Next cycle in: ${minutes}m ${seconds}s`);
        system.logger.info(`Next cycle countdown: ${minutes}m ${seconds}s remaining`);
      } else {
        // Reset countdown khi cycle mới bắt đầu
        timeRemaining = intervalMinutes * 60;
      }
    }, 180000); // Chạy mỗi 3 phút (180000ms)
    
    // Setup main interval
    const intervalId = setInterval(async () => {
      console.log('\n⏰ Auto-run triggered (interval: ' + intervalMinutes + ' minutes)');
      timeRemaining = intervalMinutes * 60; // Reset countdown
      try {
        await processAutomation();
      } catch (error) {
        system.logger.error('Error in auto-run cycle:', error);
        console.error('❌ Auto-run cycle failed:', error.message);
      }
    }, intervalMs);
    
    console.log(`\n✅ System is running. Will auto-run every ${intervalMinutes} minutes.`);
    console.log('⏳ Countdown updates every 3 minutes.');
    console.log('Press Ctrl+C to stop.');
    
    return { intervalId, countdownInterval };
  };
  
  // Chạy lần đầu ngay lập tức
  await processAutomation();
  
  // Setup interval
  const { intervalId, countdownInterval } = setupAutoRun();
  
  // Lưu vào global để có thể clear khi shutdown
  global.mainInterval = intervalId;
  global.countdownInterval = countdownInterval;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { WebAutomationSystem };
