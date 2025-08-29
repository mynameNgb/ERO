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
