const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const rateLimit = require('express-rate-limit');
require('dotenv').config();  // 加载.env文件

// 添加环境变量检查
console.log('Environment variables check:');
console.log('MAIL_USER:', process.env.MAIL_USER ? '✓ Set' : '✗ Missing');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✓ Set' : '✗ Missing');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Missing');
console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI ? '✓ Set' : '✗ Missing');
console.log('GOOGLE_REFRESH_TOKEN:', process.env.GOOGLE_REFRESH_TOKEN ? '✓ Set' : '✗ Missing');
console.log('RECEIVER_EMAIL:', process.env.RECEIVER_EMAIL ? '✓ Set' : '✗ Missing');

const app = express();
const path = require('path');

// 禁用 punycode 警告
process.removeAllListeners('warning');

// 更详细的 CORS 配置
const allowedOrigins = [
    'http://localhost:3000',      // 本地开发需要端口号
    'https://crownnewmaterial.com',
    'https://www.crownnewmaterial.com',
    'https://crownnewmaterials.com',
    'https://www.crownnewmaterials.com'
];

app.use(cors({
    origin: function(origin, callback) {
        // 允许没有 origin 的请求（比如同源请求）
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// 定义 limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { 
        success: false, 
        message: 'Too many requests. Please try again in 1 hour. / 请求次数过多，请1小时后再试。' 
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// 应用 limiter 到邮件路由
app.use('/send-email', limiter);

// 邮件发送路由
app.post('/send-email', async (req, res) => {
    try {
        const { name, email, phone, message, honeypot } = req.body;

        // 检查honeypot字段
        if (honeypot) {
            return res.json({ success: false });
        }

        // 检查必填字段
        if (!name || !email || !message) {
            return res.json({ 
                success: false, 
                message: 'Required fields are missing / 缺少必填字段' 
            });
        }

        // 验证字段格式
        const nameRegex = /^[\p{L}\s]{2,50}$/u;  // 支持所有语言的字符
        const phoneRegex = /^[\d\s\-+()]{5,20}$/;  // 更宽松的电话号码格式
        const emailRegex = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;  // 更新的邮箱验证

        if (!nameRegex.test(name)) {
            return res.json({ 
                success: false, 
                message: 'Invalid name format / 姓名格式不正确' 
            });
        }

        if (!emailRegex.test(email)) {
            return res.json({ 
                success: false, 
                message: 'Invalid email format / 邮箱格式不正确' 
            });
        }

        if (phone && !phoneRegex.test(phone)) {
            return res.json({ 
                success: false, 
                message: 'Invalid phone format / 电话格式不正确' 
            });
        }

        // 获取新的 access token
        const tokens = await oauth2Client.getAccessToken();
        console.log('Access token obtained');

        // 获取 Gmail API 实例
        const gmail = google.gmail({ 
            version: 'v1', 
            auth: oauth2Client,
            timeout: 10000  // 10 秒超时
        });

        // 构建邮件内容
        const emailContent = `From: "${name}" <${process.env.MAIL_USER}>
To: ${process.env.RECEIVER_EMAIL}
Subject: =?UTF-8?B?${Buffer.from('新域名购买咨询').toString('base64')}?=
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: base64

${Buffer.from(`
姓名: ${name}
电话: ${phone || '未提供'}
邮箱: ${email}
留言: ${message}
发送时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
`).toString('base64')}`;

        // 转换为 Base64 URL 格式
        const encodedEmail = Buffer.from(emailContent)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        // 使用 Gmail API 发送邮件
        const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedEmail
            }
        });

        console.log('Email sent successfully:', result.data);
        res.json({ success: true });
    } catch (error) {
        console.error('Detailed email error:', {
            message: error.message,
            name: error.name,
            code: error.code,
            response: error.response?.data
        });

        // 特定错误处理
        if (error.message === 'invalid_grant') {
            console.log('Refresh token is invalid or expired. Please re-authenticate.');
        }

        res.json({ 
            success: false, 
            message: 'Failed to send email / 发送邮件失败，请稍后重试',
            debug: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 静态文件服务务必在动态路由之后
app.use(express.static('public'));

// 根路由处理
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 处理放在最后
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Route not found / 路由未找到' 
    });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        success: false, 
        message: 'Internal server error / 服务器内部错误' 
    });
});

// 首先定义 SCOPES
const SCOPES = [
    'https://mail.google.com/',
    'https://www.googleapis.com/auth/gmail.send'
];

// 然后配置 OAuth2
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// 添加错误处理的凭证设置
oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    scope: SCOPES.join(' ')  // 添加 scope
});

// 添加 token 刷新事件监听
oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
        console.log('New refresh token received:', tokens.refresh_token);
        // 存储新的 refresh token
        process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
    }
    console.log('Access token refreshed');
});

// 修改测试函数，只验证认证配置
async function testGmailAPI() {
    try {
        console.log('Testing Gmail API configuration...');
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // 只测试认证，获取用户信息
        await oauth2Client.getAccessToken();
        const profile = await gmail.users.getProfile({
            userId: 'me'
        });
        
        console.log('Gmail API test successful. Connected as:', profile.data.emailAddress);
        return true;
    } catch (error) {
        console.error('Gmail API test failed:', {
            message: error.message,
            name: error.name,
            response: error.response?.data
        });
        console.log('Please ensure your OAuth2 credentials are valid and refresh token is up to date');
        return false;
    }
}

// 修改端口配置，让它在本地开发和生产环境都能正常工作
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    // 在生产环境中不显示端口信息
    if (process.env.NODE_ENV === 'production') {
        console.log('Server running in production mode');
    } else {
        console.log(`Server running on port ${PORT}`);
    }
    await testGmailAPI();
}); 
