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
    fs.ensureDirSync(path.dirname(this.dataPath));
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
