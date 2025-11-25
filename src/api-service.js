const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class ApiService {
  constructor(logger, apiUrl) {
    this.logger = logger;
    this.apiUrl = apiUrl;
    this.token = null;
    this.reqtime = null;
    this.dataFilePath = path.join(__dirname, '../data/realtime-data.json');
  }

  async getToken() {
    try {
      this.logger.info('Calling API to get token...');
      const response = await axios.get(`${this.apiUrl}/api/data/util/gettokenNonAid`, {
        headers: {
          'Content-Type': 'application/json'
        },data: {
          reqid: "Get_GateOut_CMA_RELEASE",
          data: {
            appversion: '2023'
          }
        }
      });

      if (response.data && response.data.token && response.data.reqtime) {
        this.token = response.data.token;
        this.reqtime = response.data.reqtime;
        this.logger.info('Token retrieved successfully');
        return true;
      } else {
        this.logger.error('Invalid token response');
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to get token:', error);
      return false;
    }
  }

  async getReleaseOrderData() {
    try {
      if (!this.token || !this.reqtime) {
        this.logger.warn('Token not available, getting new token...');
        const tokenSuccess = await this.getToken();
        if (!tokenSuccess) {
          throw new Error('Failed to get token');
        }
      }

      this.logger.info('Calling API to get release order data...');
      const response = await axios.get(`${this.apiUrl}/api/data/process/Get_GateOut_CMA_RELEASE`, {
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          token: this.token,
          reqtime: this.reqtime,
          data: {
            appversion: '2023'
          }
        }
      });

      if (response.data) {
        this.logger.info('Release order data retrieved successfully');
        return response.data;
      } else {
        this.logger.error('Invalid data response');
        return null;
      }
    } catch (error) {
      this.logger.error('Failed to get release order data:', error);
      // Nếu lỗi 401/403, thử lấy token mới
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        this.logger.warn('Token expired, getting new token...');
        const tokenSuccess = await this.getToken();
        if (tokenSuccess) {
          return await this.getReleaseOrderData();
        }
      }
      return null;
    }
  }

  async updateRealtimeData() {
    try {
      this.logger.info('Starting to update realtime data...');
      
      // Lấy token mới
      const tokenSuccess = await this.getToken();
      if (!tokenSuccess) {
        this.logger.error('Cannot update data: failed to get token');
        return null;
      }

      // Lấy dữ liệu release order
      const data = await this.getReleaseOrderData();
      if (!data) {
        this.logger.error('Cannot update data: failed to get release order data');
        return null;
      }

      this.logger.info(`Realtime data updated successfully at ${new Date().toISOString()}`);
      console.log(`✓ Data updated at ${new Date().toLocaleString()}`);
      
      return data;
    } catch (error) {
      this.logger.error('Error updating realtime data:', error);
      return null;
    }
  }

  async startAutoUpdate(intervalMinutes = 15) {
    this.logger.info(`Starting auto-update service with ${intervalMinutes} minutes interval`);
    console.log(`Auto-update started: every ${intervalMinutes} minutes`);
    
    // Cập nhật ngay lần đầu và đợi hoàn thành
    const initialData = await this.updateRealtimeData();

    // Thiết lập interval để cập nhật định kỳ
    const intervalMs = intervalMinutes * 60 * 1000;
    this.updateInterval = setInterval(async () => {
      await this.updateRealtimeData();
    }, intervalMs);
    
    return initialData;
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.logger.info('Auto-update service stopped');
      console.log('Auto-update stopped');
    }
  }
}

module.exports = { ApiService };
