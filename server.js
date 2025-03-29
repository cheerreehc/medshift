// server.js - ไฟล์หลักสำหรับ MedFlex application
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { testConnection, setupDatabase } = require('./models/database');

// เริ่มต้น Express app
const app = express();
const PORT = process.env.PORT || 3000;

// รูปแบบ middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ตั้งค่า session
app.use(session({
  secret: 'medflex-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 } // 1 hour
}));

// ตั้งค่า view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// เพิ่ม middleware สำหรับตรวจสอบสถานะการล็อกอิน
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// เชื่อมต่อเส้นทาง (routes)
const authRoutes = require('./routes/auth');
const doctorRoutes = require('./routes/doctor');
const adminRoutes = require('./routes/admin');

app.use('/auth', authRoutes);
app.use('/doctor', doctorRoutes);
app.use('/admin', adminRoutes);

// หน้าแรก
app.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'admin') {
      res.redirect('/admin/dashboard');
    } else {
      res.redirect('/doctor/dashboard');
    }
  } else {
    res.render('index');
  }
});

// เริ่มต้นเซิร์ฟเวอร์
async function startServer() {
  try {
    // ทดสอบการเชื่อมต่อฐานข้อมูล
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('Unable to connect to database. Please check your configuration.');
      process.exit(1);
    }
    
    // ตั้งค่าฐานข้อมูล (สร้างตาราง)
    await setupDatabase();
    
    // เริ่ม server
    app.listen(PORT, () => {
      console.log(`MedFlex server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();