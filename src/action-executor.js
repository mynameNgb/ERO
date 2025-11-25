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
    const { type, selector, value, print_url, firstOnly, matchField } = action;
    this.logger.info(`Executing action: ${type} on ${selector}`);
    
    const timeout = 10000; // 10 seconds timeout
    
    try {
      switch (type) {
        case 'click': {
          // Kiểm tra tồn tại của selector trước
          const elementExists = await page.$(selector).catch(() => null);
          if (!elementExists) {
            throw new Error(`Selector not found: ${selector}`);
          }
          
          await page.waitForSelector(selector, { timeout, state: 'visible' });
          if (firstOnly) {
            // Click vào phần tử đầu tiên nếu có nhiều phần tử
            const elements = await page.$$(selector);
            if (elements.length > 0) {
              let targetElement = elements[0];
              
              // Nếu có matchField, tìm element có giá trị khớp với data
              if (matchField) {
                const matchValue = data[matchField.value].toString();
                this.logger.info(`Looking for element with ${matchField.selector} = ${matchValue}`);
                
                for (const element of elements) {
                  try {
                    const fieldElement = await element.$(matchField.selector);
                    if (fieldElement) {
                      const fieldValue = await fieldElement.textContent();
                      if (fieldValue && fieldValue.trim().includes(matchValue)) {
                        targetElement = element;
                        this.logger.info(`Found matching element with ${matchField.selector} = ${matchValue}`);
                        break;
                      }
                    }
                  } catch (e) {
                    // Bỏ qua element không có field cần tìm
                    continue;
                  }
                }
              }
              
              await targetElement.click();
            } else {
              throw new Error(`No elements found for selector: ${selector}`);
            }
          } else {
            await page.click(selector);
          }
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
          // Kiểm tra tồn tại của selector trước
          const elementExists = await page.$(selector).catch(() => null);
          if (!elementExists) {
            throw new Error(`Selector not found: ${selector}`);
          }
          
          await page.waitForSelector(selector, { timeout, state: 'visible' });
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
          // Kiểm tra tồn tại của selector trước
          const selectExists = await page.$(selector).catch(() => null);
          if (!selectExists) {
            throw new Error(`Selector not found: ${selector}`);
          }
          
          await page.waitForSelector(selector, { timeout, state: 'visible' });
          const selectValue = this.resolveValue(value, data);
          await page.selectOption(selector, selectValue);
          break;
        case 'wait':
          // Kiểm tra tồn tại của selector trước
          const waitExists = await page.$(selector).catch(() => null);
          if (!waitExists) {
            throw new Error(`Selector not found: ${selector}`);
          }
          
          await page.waitForSelector(selector, { timeout, state: 'visible' });
          break;
        case 'scroll':
          // Kiểm tra tồn tại trước khi scroll
          const scrollExists = await page.$(selector).catch(() => null);
          if (!scrollExists) {
            throw new Error(`Selector not found: ${selector}`);
          }
          
          await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (element) element.scrollIntoView();
          }, selector);
          break;
        case 'hover':
          // Kiểm tra tồn tại của selector trước
          const hoverExists = await page.$(selector).catch(() => null);
          if (!hoverExists) {
            throw new Error(`Selector not found: ${selector}`);
          }
          
          await page.waitForSelector(selector, { timeout, state: 'visible' });
          await page.hover(selector);
          break;
        default:
          this.logger.warn(`Unknown action type: ${type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to execute action ${type} on ${selector}: ${error.message}`);
      console.error(`✗ Action failed [${type}] ${selector}: ${error.message}`);
      throw error; // Throw lại error để caller xử lý
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
