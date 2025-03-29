// routes/doctor.js
const express = require('express');
const router = express.Router();
const { pool } = require('../models/database');

// Middleware ตรวจสอบการล็อกอิน
const checkAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// หน้า Dashboard สำหรับหมอ
router.get('/dashboard', checkAuth, async (req, res) => {
  // ถ้าเป็น admin ให้ redirect ไปหน้า admin
  if (req.session.user.role === 'admin') {
    return res.redirect('/admin/dashboard');
  }
  
  try {
    const doctorId = req.session.user.id;
    
    // ดึงข้อมูลตารางเวรของหมอ
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    
    const [schedules] = await pool.query(
      `SELECT s.*, DATE_FORMAT(s.date, '%Y-%m-%d') as formatted_date 
       FROM schedules s 
       WHERE s.doctor_id = ? AND s.date BETWEEN ? AND ? 
       ORDER BY s.date, s.shift`,
      [doctorId, startDate, endDate]
    );
    
    // ดึงข้อมูลวันที่ไม่สะดวก
    const [unavailableDates] = await pool.query(
      `SELECT ud.*, DATE_FORMAT(ud.date, '%Y-%m-%d') as formatted_date 
       FROM unavailable_dates ud 
       WHERE ud.doctor_id = ? 
       ORDER BY ud.date`,
      [doctorId]
    );
    
    res.render('doctor-dashboard', {
      schedules,
      unavailableDates,
      currentMonth: month + 1,
      currentYear: year
    });
  } catch (error) {
    console.error('Error loading doctor dashboard:', error);
    res.status(500).render('error', { message: 'เกิดข้อผิดพลาดในการโหลดข้อมูล' });
  }
});

// API สำหรับแจ้งวันที่ไม่สะดวก
router.post('/unavailable-dates', checkAuth, async (req, res) => {
  if (req.session.user.role === 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์ในการทำรายการนี้' });
  }
  
  try {
    const { date, reason } = req.body;
    const doctorId = req.session.user.id;
    
    // ตรวจสอบว่าวันที่ถูกต้องหรือไม่
    if (!date) {
      return res.status(400).json({ error: 'กรุณาระบุวันที่' });
    }
    
    // ตรวจสอบว่าวันที่นี้มีตารางเวรหรือไม่
    const [existingSchedules] = await pool.query(
      'SELECT * FROM schedules WHERE doctor_id = ? AND date = ?',
      [doctorId, date]
    );
    
    if (existingSchedules.length > 0) {
      return res.status(400).json({ 
        error: 'คุณมีตารางเวรในวันนี้แล้ว กรุณาติดต่อแอดมินเพื่อเปลี่ยนแปลง' 
      });
    }
    
    // ตรวจสอบว่ามีการแจ้งไว้แล้วหรือไม่
    const [existingDates] = await pool.query(
      'SELECT * FROM unavailable_dates WHERE doctor_id = ? AND date = ?',
      [doctorId, date]
    );
    
    if (existingDates.length > 0) {
      return res.status(400).json({ error: 'คุณได้แจ้งวันที่ไม่สะดวกนี้ไปแล้ว' });
    }
    
    // บันทึกข้อมูลวันที่ไม่สะดวก
    const [result] = await pool.query(
      'INSERT INTO unavailable_dates (doctor_id, date, reason) VALUES (?, ?, ?)',
      [doctorId, date, reason || null]
    );
    
    // ดึงข้อมูลที่เพิ่งบันทึก
    const [newDate] = await pool.query(
      `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') as formatted_date 
       FROM unavailable_dates 
       WHERE id = ?`,
      [result.insertId]
    );
    
    res.status(201).json({ 
      message: 'บันทึกข้อมูลวันที่ไม่สะดวกเรียบร้อยแล้ว', 
      data: newDate[0] 
    });
  } catch (error) {
    console.error('Error adding unavailable date:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
  }
});

// API สำหรับลบวันที่ไม่สะดวก
router.delete('/unavailable-dates/:id', checkAuth, async (req, res) => {
  if (req.session.user.role === 'admin') {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์ในการทำรายการนี้' });
  }
  
  try {
    const id = req.params.id;
    const doctorId = req.session.user.id;
    
    // ตรวจสอบว่าข้อมูลนี้เป็นของหมอคนนี้หรือไม่
    const [unavailableDates] = await pool.query(
      'SELECT * FROM unavailable_dates WHERE id = ? AND doctor_id = ?',
      [id, doctorId]
    );
    
    if (unavailableDates.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลวันที่ไม่สะดวก' });
    }
    
    // ลบข้อมูล
    await pool.query(
      'DELETE FROM unavailable_dates WHERE id = ?',
      [id]
    );
    
    res.json({ message: 'ลบข้อมูลวันที่ไม่สะดวกเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error deleting unavailable date:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
  }
});

// ดูตารางเวรเดือนเฉพาะ
router.get('/schedules/:year/:month', checkAuth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const doctorId = req.session.user.id;
    
    // ตรวจสอบความถูกต้องของข้อมูล
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'ข้อมูลปีหรือเดือนไม่ถูกต้อง' });
    }
    
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0);
    
    // ดึงข้อมูลตารางเวร
    const [schedules] = await pool.query(
      `SELECT s.*, DATE_FORMAT(s.date, '%Y-%m-%d') as formatted_date 
       FROM schedules s 
       WHERE s.doctor_id = ? AND s.date BETWEEN ? AND ? 
       ORDER BY s.date, s.shift`,
      [doctorId, startDate, endDate]
    );
    
    res.json({ schedules });
  } catch (error) {
    console.error('Error fetching monthly schedules:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลตารางเวร' });
  }
});

module.exports = router;