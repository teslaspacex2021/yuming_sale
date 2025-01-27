const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const rateLimit = require('express-rate-limit');
require('dotenv').config();  // 加载.env文件
const app = express();
const path = require('path');

// 禁用 punycode 警告
process.removeAllListeners('warning');

// 首先定义所有中间件
app.use(cors());
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
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

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

        // 获取transporter实例
        const transporter = await createTransporter();

        // 发送邮件
        await transporter.sendMail({
            from: process.env.MAIL_USER,
            to: process.env.RECEIVER_EMAIL,
            subject: '新域名购买咨询',
            html: `
                <h2>新域名咨询请求</h2>
                <p><strong>姓名:</strong> ${name}</p>
                <p><strong>电话:</strong> ${phone || '未提供'}</p>
                <p><strong>邮箱:</strong> ${email}</p>
                <p><strong>留言:</strong> ${message}</p>
                <p><strong>发送时间:</strong> ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
            `
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Email error:', error);
        res.json({ 
            success: false, 
            message: 'Failed to send email / 发送邮件失败，请稍后重试' 
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

// 配置 OAuth2
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// 配置SMTP邮件发送
async function createTransporter() {
    try {
        // 自动获取新的 access token
        const accessToken = await oauth2Client.getAccessToken();
        
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: process.env.MAIL_USER,
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
                // 使用自动获取的 access token
                accessToken: accessToken.token
            }
        });
    } catch (error) {
        console.error('Error creating transporter:', error);
        throw error;
    }
}

// 验证邮件配置
async function verifyTransporter() {
    try {
        const transporter = await createTransporter();
        await transporter.verify();
        console.log('SMTP connection established successfully');
        return transporter;
    } catch (error) {
        console.error('SMTP verification failed:', error);
        throw error;
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 
