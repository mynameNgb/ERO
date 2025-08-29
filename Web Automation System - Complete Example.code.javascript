// package.json
{
  "name": "web-automation-system",
  "version": "1.0.0",
  "description": "Automated web interaction system with realtime data processing",
  "main": "src/main.js",
  "scripts": {
    "start": "node src/main.js",
    "dev": "nodemon src/main.js",
    "test": "node src/test.js"
  },
  "dependencies": {
    "playwright": "^1.40.0",
    "chokidar": "^3.5.3",
    "winston": "^3.11.0",
    "crypto": "^1.0.1",
    "fs-extra": "^11.1.1",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}

// src/main.js
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
      
      // Initialize browser
      await this.browserManager.initialize();
      
      // Setup data watcher
      this.dataWatcher.onDataChange((data) => {
        this.processRealtimeData(data);
      });
      
      // Start watching realtime data
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
    // Check if site should be processed based on data conditions
    if (siteConfig.conditions) {
      return siteConfig.conditions.some(condition => {
        return this.evaluateCondition(condition, data);
      });
    }
    return true;
  }

  evaluateCondition(condition, data) {
    try {
      // Simple condition evaluation
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
      
      // Get or create page for this site
      const page = await this.browserManager.getPage(siteConfig.name);
      
      // Navigate to site if not already there
      if (page.url() !== siteConfig.url) {
        await page.goto(siteConfig.url);
        await page.waitForLoadState('networkidle');
      }

      // Check if login is needed
      const isLoggedIn = await this.checkLoginStatus(page, siteConfig);
      if (!isLoggedIn) {
        await this.performLogin(page, siteConfig);
      }

      // Execute actions based on data
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

      // Wait for login form
      await page.waitForSelector(selectors.username_field);
      
      // Fill credentials
      await page.fill(selectors.username_field, username);
      await page.fill(selectors.password_field, password);
      
      // Click login button
      await page.click(selectors.login_button);
      
      // Wait for navigation or success indicator
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

// Main execution
async function main() {
  const system = new WebAutomationSystem();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await system.shutdown();
    process.exit(0);
  });

  const initialized = await system.initialize();
  if (initialized) {
    console.log('Web Automation System is running...');
    console.log('Press Ctrl+C to stop');
  } else {
    console.error('Failed to initialize system');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { WebAutomationSystem };

// src/browser-manager.js
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
      const page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Set viewport
      await page.setViewportSize({ width: 1280, height: 720 });
      
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

// src/action-executor.js
class ActionExecutor {
  constructor(logger) {
    this.logger = logger;
  }

  async executeActions(page, actions, data) {
    for (const action of actions) {
      try {
        // Check if action should be executed based on condition
        if (action.condition && !this.evaluateCondition(action.condition, data)) {
          continue;
        }

        await this.executeAction(page, action, data);
        
        // Add delay between actions
        if (action.delay) {
          await page.waitForTimeout(action.delay);
        } else {
          await page.waitForTimeout(this.getRandomDelay());
        }
      } catch (error) {
        this.logger.error(`Error executing action ${action.type}:`, error);
      }
    }
  }

  async executeAction(page, action, data) {
    const { type, selector, value } = action;
    
    this.logger.info(`Executing action: ${type} on ${selector}`);

    switch (type) {
      case 'click':
        await page.waitForSelector(selector);
        await page.click(selector);
        break;

      case 'input':
        await page.waitForSelector(selector);
        const inputValue = this.resolveValue(value, data);
        await page.fill(selector, inputValue);
        break;

      case 'select':
        await page.waitForSelector(selector);
        const selectValue = this.resolveValue(value, data);
        await page.selectOption(selector, selectValue);
        break;

      case 'wait':
        await page.waitForSelector(selector);
        break;

      case 'scroll':
        await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          if (element) element.scrollIntoView();
        }, selector);
        break;

      case 'hover':
        await page.waitForSelector(selector);
        await page.hover(selector);
        break;

      default:
        this.logger.warn(`Unknown action type: ${type}`);
    }
  }

  resolveValue(value, data) {
    if (typeof value === 'string' && value.startsWith('data.')) {
      const path = value.substring(5);
      return this.getNestedValue(data, path);
    }
    return value;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
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

  getRandomDelay() {
    return Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
  }
}

module.exports = { ActionExecutor };

// src/data-watcher.js
const chokidar = require('chokidar');
const fs = require('fs-extra');
const path = require('path');

class DataWatcher {
  constructor(logger) {
    this.logger = logger;
    this.watcher = null;
    this.dataPath = path.join(__dirname, '../data/realtime-data.json');
    this.callbacks = [];
  }

  onDataChange(callback) {
    this.callbacks.push(callback);
  }

  startWatching() {
    // Ensure data directory exists
    fs.ensureDirSync(path.dirname(this.dataPath));
    
    // Create initial data file if it doesn't exist
    if (!fs.existsSync(this.dataPath)) {
      fs.writeJsonSync(this.dataPath, { status: 'initialized', timestamp: new Date().toISOString() });
    }

    this.watcher = chokidar.watch(this.dataPath);
    
    this.watcher.on('change', () => {
      this.handleDataChange();
    });

    this.logger.info(`Started watching data file: ${this.dataPath}`);
  }

  async handleDataChange() {
    try {
      const data = await fs.readJson(this.dataPath);
      this.logger.info('Data file changed, processing...', { data });
      
      // Notify all callbacks
      for (const callback of this.callbacks) {
        try {
          await callback(data);
        } catch (error) {
          this.logger.error('Error in data change callback:', error);
        }
      }
    } catch (error) {
      this.logger.error('Error reading data file:', error);
    }
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.logger.info('Stopped watching data file');
    }
  }
}

module.exports = { DataWatcher };

// src/logger.js
const winston = require('winston');
const path = require('path');

class Logger {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'web-automation' },
      transports: [
        new winston.transports.File({ 
          filename: path.join(__dirname, '../logs/error.log'), 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: path.join(__dirname, '../logs/combined.log') 
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  error(message, error = null) {
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack });
    } else {
      this.logger.error(message, { error });
    }
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }
}

module.exports = { Logger };

// config/sites.json
{
  "sites": [
    {
      "name": "example-site",
      "url": "https://example.com/login",
      "credentials": {
        "username": "your-username",
        "password": "your-password"
      },
      "selectors": {
        "username_field": "#username",
        "password_field": "#password",
        "login_button": "#login-btn"
      },
      "login_check_selector": ".user-profile",
      "conditions": [
        "data.status === 'active'",
        "data.shouldProcess === true"
      ],
      "actions": [
        {
          "type": "click",
          "selector": "#dashboard-btn",
          "condition": "data.navigateToDashboard",
          "delay": 2000
        },
        {
          "type": "input",
          "selector": "#search-input",
          "value": "data.searchTerm",
          "condition": "data.searchTerm",
          "delay": 1000
        },
        {
          "type": "click",
          "selector": "#search-btn",
          "delay": 3000
        },
        {
          "type": "select",
          "selector": "#category-select",
          "value": "data.category",
          "condition": "data.category",
          "delay": 1500
        }
      ]
    }
  ]
}

// data/realtime-data.json (example)
{
  "status": "active",
  "shouldProcess": true,
  "navigateToDashboard": true,
  "searchTerm": "automation test",
  "category": "technology",
  "timestamp": "2025-08-29T02:59:00.000Z"
}

// .env.example
NODE_ENV=development
HEADLESS=false
LOG_LEVEL=info

// README.md
# Web Automation System

A complete web automation system that performs automated actions on websites based on realtime data changes.

## Features

- **Realtime Data Processing**: Monitors JSON files for changes and triggers actions
- **Multi-site Support**: Can handle multiple websites simultaneously
- **Flexible Actions**: Supports click, input, select, wait, scroll, hover actions
- **Conditional Logic**: Execute actions based on data conditions
- **Comprehensive Logging**: Detailed logging with Winston
- **Browser Management**: Efficient browser and page management with Playwright
- **Graceful Shutdown**: Proper cleanup on system exit

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env` and adjust settings
2. Update `config/sites.json` with your website configurations
3. Modify `data/realtime-data.json` to trigger actions

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## Configuration Examples

### Site Configuration
```json
{
  "name": "my-site",
  "url": "https://mysite.com",
  "credentials": {
    "username": "user",
    "password": "pass"
  },
  "selectors": {
    "username_field": "#user",
    "password_field": "#pass",
    "login_button": "#login"
  },
  "actions": [
    {
      "type": "click",
      "selector": "#button",
      "condition": "data.shouldClick"
    }
  ]
}
```

### Data Format
```json
{
  "status": "active",
  "shouldClick": true,
  "inputValue": "test data",
  "timestamp": "2025-08-29T02:59:00.000Z"
}
```

## Action Types

- `click`: Click on an element
- `input`: Fill input fields
- `select`: Select dropdown options
- `wait`: Wait for element to appear
- `scroll`: Scroll element into view
- `hover`: Hover over element

## Security Notes

- Store sensitive credentials securely
- Use environment variables for production
- Consider implementing encryption for passwords
- Add rate limiting to avoid detection

## License

MIT License