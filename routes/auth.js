// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../models/database');

// หน้าล็อกอิน
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

// ดำเนินการล็อกอิน
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // ดึงข้อมูลผู้ใช้จากฐานข้อมูล
    const [users] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    
    // ถ้าไม่พบผู้ใช้
    if (users.length === 0) {
      return res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    
    const user = users[0];
    
    // ตรวจสอบรหัสผ่าน
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.render('login', { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    
    // บันทึกข้อมูลผู้ใช้ใน session
    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };
    
    // ลิงก์ไปยังหน้า dashboard ตามบทบาท
    if (user.role === 'admin') {
      res.redirect('/admin/dashboard');
    } else {
      res.redirect('/doctor/dashboard');
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'เกิดข้อผิดพลาดในการล็อกอิน กรุณาลองใหม่อีกครั้ง' });
  }
});

// ออกจากระบบ
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login');
  });
});

// เปลี่ยนรหัสผ่าน
router.get('/change-password', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  
  res.render('change-password', { error: null, success: null });
});

router.post('/change-password', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    // ตรวจสอบว่ารหัสผ่านใหม่ตรงกันหรือไม่
    if (newPassword !== confirmPassword) {
      return res.render('change-password', { 
        error: 'รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน', 
        success: null 
      });
    }
    
    // ดึงข้อมูลผู้ใช้ปัจจุบัน
    const [users] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [req.session.user.id]
    );
    
    if (users.length === 0) {
      return res.render('change-password', { 
        error: 'ไม่พบข้อมูลผู้ใช้', 
        success: null 
      });
    }
    
    const user = users[0];
    
    // ตรวจสอบรหัสผ่านปัจจุบัน
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isCurrentPasswordValid) {
      return res.render('change-password', { 
        error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง', 
        success: null 
      });
    }
    
    // เข้ารหัสรหัสผ่านใหม่
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // อัปเดตรหัสผ่านในฐานข้อมูล
    await pool.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.session.user.id]
    );
    
    res.render('change-password', { 
      error: null, 
      success: 'เปลี่ยนรหัสผ่านสำเร็จ' 
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.render('change-password', { 
      error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน', 
      success: null 
    });
  }
});

module.exports = router;