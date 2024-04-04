// 使用 require 替代 import
const { VercelRequest, VercelResponse } = require('@vercel/node');
const axios = require('axios');
const { randomUUID } = require('crypto');
const https = require('https');

// 环境变量或硬编码值
const baseUrl = process.env.BASE_URL || "https://chat.openai.com";
const apiUrl = `${baseUrl}/backend-api/conversation`;

// 创建 axios 实例
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  headers: {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "oai-language": "en-US",
    origin: baseUrl,
    pragma: "no-cache",
    referer: baseUrl,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  },
});

// 导出 module.exports 以用于 Vercel Serverless 函数
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const oaiDeviceId = randomUUID();
    const token = process.env.OAI_TOKEN; // 假设你的 OpenAI 令牌存储在环境变量中

    try {
      const response = await axiosInstance.post(apiUrl, req.body, {
        headers: {
          "oai-device-id": oaiDeviceId,
          "openai-sentinel-chat-requirements-token": token,
        },
      });

      // 成功响应
      res.status(200).json(response.data);
    } catch (error) {
      // 错误处理
      console.error('Error:', error.response?.data ?? error.message);
      res.status(500).json({
        error: 'Internal Server Error',
        description: error.message
      });
    }
  } else {
    // 非 POST 请求处理
    res.status(405).json({ error: 'Method Not Allowed' });
  }
};
