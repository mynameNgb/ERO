class ActionExecutor {
  constructor(logger) {
    this.logger = logger;
  }

  async executeActions(page, actions, data) {
    for (const action of actions) {
      try {
        if (action.condition && !this.evaluateCondition(action.condition, data)) {
          continue;
        }
        await this.executeAction(page, action, data);
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
    const { type, selector, value, print_url } = action;
    this.logger.info(`Executing action: ${type} on ${selector}`);
    switch (type) {
      case 'click': {
        await page.waitForSelector(selector);
        await page.click(selector);
        // Đợi trang redirect (nếu có)
        await page.waitForLoadState('networkidle').catch(() => {});
        if (print_url) {
          const currentUrl = page.url();
          this.logger.info(`Redirected URL after click: ${currentUrl}`);
          console.log(`Redirected URL after click: ${currentUrl}`);
        }
        break;
      }
      case 'input': {
        await page.waitForSelector(selector);
        const inputValue = this.resolveValue(value, data);
        await page.fill(selector, inputValue);
        if (print_url) {
          const currentUrl = page.url();
          this.logger.info(`URL after input: ${currentUrl}`);
          console.log(`URL after input: ${currentUrl}`);
        }
        break;
      }
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
    return Math.floor(Math.random() * 2000) + 1000;
  }
}

module.exports = { ActionExecutor };
