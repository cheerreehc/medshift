// routes/admin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../models/database');

// Middleware ตรวจสอบการล็อกอิน
const checkAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// Middleware ตรวจสอบว่าเป็น admin
const checkAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'ไม่มีสิทธิ์ในการเข้าถึงหน้านี้' });
  }
  next();
};

// หน้า Dashboard สำหรับแอดมิน
router.get('/dashboard', checkAuth, checkAdmin, async (req, res) => {
  try {
    // ดึงข้อมูลหมอทั้งหมด
    const [doctors] = await pool.query(
      'SELECT id, username, name, email, phone FROM users WHERE role = "doctor" ORDER BY name'
    );
    
    // ดึงข้อมูลตารางเวรเดือนปัจจุบัน
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    
    const [schedules] = await pool.query(
      `SELECT s.*, u.name as doctor_name, DATE_FORMAT(s.date, '%Y-%m-%d') as formatted_date 
       FROM schedules s 
       JOIN users u ON s.doctor_id = u.id 
       WHERE s.date BETWEEN ? AND ? 
       ORDER BY s.date, s.shift`,
      [startDate, endDate]
    );
    
    res.render('admin-dashboard', {
      doctors,
      schedules,
      currentMonth: month + 1,
      currentYear: year
    });
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
    res.status(500).render('error', { message: 'เกิดข้อผิดพลาดในการโหลดข้อมูล' });
  }
});

// จัดการหมอ
router.get('/doctors', checkAuth, checkAdmin, async (req, res) => {
  try {
    const [doctors] = await pool.query(
      'SELECT id, username, name, email, phone, created_at FROM users WHERE role = "doctor" ORDER BY name'
    );
    
    res.render('admin-doctors', { doctors });
  } catch (error) {
    console.error('Error loading doctors:', error);
    res.status(500).render('error', { message: 'เกิดข้อผิดพลาดในการโหลดข้อมูลหมอ' });
  }
});

// เพิ่มหมอใหม่
router.post('/doctors', checkAuth, checkAdmin, async (req, res) => {
  try {
    const { username, password, name, email, phone } = req.body;
    
    // ตรวจสอบข้อมูลที่จำเป็น
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็น (ชื่อผู้ใช้, รหัสผ่าน, ชื่อ-นามสกุล)' });
    }
    
    // ตรวจสอบว่ามีชื่อผู้ใช้นี้อยู่แล้วหรือไม่
    const [existingUsers] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว' });
    }
    
    // เข้ารหัสรหัสผ่าน
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // บันทึกข้อมูลหมอใหม่
    const [result] = await pool.query(
      `INSERT INTO users (username, password, name, role, email, phone)
       VALUES (?, ?, ?, 'doctor', ?, ?)`,
      [username, hashedPassword, name, email || null, phone || null]
    );
    
    // ดึงข้อมูลที่เพิ่งสร้าง
    const [newDoctor] = await pool.query(
      'SELECT id, username, name, email, phone, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({ 
      message: 'เพิ่มหมอเรียบร้อยแล้ว', 
      data: newDoctor[0] 
    });
  } catch (error) {
    console.error('Error adding doctor:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มหมอ' });
  }
});

// ดูข้อมูลหมอ
router.get('/doctors/:id', checkAuth, checkAdmin, async (req, res) => {
  try {
    const doctorId = req.params.id;
    
    // ดึงข้อมูลหมอ
    const [doctors] = await pool.query(
      'SELECT id, username, name, email, phone, created_at FROM users WHERE id = ? AND role = "doctor"',
      [doctorId]
    );
    
    if (doctors.length === 0) {
      return res.status(404).render('error', { message: 'ไม่พบข้อมูลหมอ' });
    }
    
    const doctor = doctors[0];
    
    // ดึงข้อมูลวันที่ไม่สะดวก
    const [unavailableDates] = await pool.query(
      `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') as formatted_date 
       FROM unavailable_dates 
       WHERE doctor_id = ? 
       ORDER BY date`,
      [doctorId]
    );
    
    // ดึงข้อมูลตารางเวร
    const [schedules] = await pool.query(
      `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') as formatted_date 
       FROM schedules 
       WHERE doctor_id = ? 
       ORDER BY date DESC, shift`,
      [doctorId]
    );
    
    res.render('admin-doctor-detail', {
      doctor,
      unavailableDates,
      schedules
    });
  } catch (error) {
    console.error('Error loading doctor details:', error);
    res.status(500).render('error', { message: 'เกิดข้อผิดพลาดในการโหลดข้อมูลหมอ' });
  }
});

// แก้ไขข้อมูลหมอ
router.put('/doctors/:id', checkAuth, checkAdmin, async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { name, email, phone } = req.body;
    
    // ตรวจสอบว่ามีหมอนี้หรือไม่
    const [doctors] = await pool.query(
      'SELECT * FROM users WHERE id = ? AND role = "doctor"',
      [doctorId]
    );
    
    if (doctors.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลหมอ' });
    }
    
    // อัปเดตข้อมูล
    await pool.query(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
      [name, email || null, phone || null, doctorId]
    );
    
    res.json({ message: 'อัปเดตข้อมูลหมอเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error updating doctor:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูลหมอ' });
  }
});

// รีเซ็ตรหัสผ่านหมอ
router.post('/doctors/:id/reset-password', checkAuth, checkAdmin, async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({ error: 'กรุณาระบุรหัสผ่านใหม่' });
    }
    
    // ตรวจสอบว่ามีหมอนี้หรือไม่
    const [doctors] = await pool.query(
      'SELECT * FROM users WHERE id = ? AND role = "doctor"',
      [doctorId]
    );
    
    if (doctors.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลหมอ' });
    }
    
    // เข้ารหัสรหัสผ่าน
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // อัปเดตรหัสผ่าน
    await pool.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, doctorId]
    );
    
    res.json({ message: 'รีเซ็ตรหัสผ่านเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน' });
  }
});

// ลบหมอ
router.delete('/doctors/:id', checkAuth, checkAdmin, async (req, res) => {
  try {
    const doctorId = req.params.id;
    
    // ตรวจสอบว่ามีหมอนี้หรือไม่
    const [doctors] = await pool.query(
      'SELECT * FROM users WHERE id = ? AND role = "doctor"',
      [doctorId]
    );
    
    if (doctors.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลหมอ' });
    }
    
    // ลบข้อมูล (ตาราง unavailable_dates และ schedules จะถูกลบอัตโนมัติจาก FOREIGN KEY CASCADE)
    await pool.query(
      'DELETE FROM users WHERE id = ?',
      [doctorId]
    );
    
    res.json({ message: 'ลบหมอเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error deleting doctor:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบหมอ' });
  }
});

// API สำหรับสร้างตารางเวร
router.post('/schedules', checkAuth, checkAdmin, async (req, res) => {
  try {
    const { doctorId, date, shift } = req.body;
    
    // ตรวจสอบข้อมูลที่จำเป็น
    if (!doctorId || !date || !shift) {
      return res.status(400).json({ error: 'กรุณาระบุข้อมูลให้ครบถ้วน' });
    }
    
    // ตรวจสอบว่าหมอมีอยู่จริงหรือไม่
    const [doctors] = await pool.query(
      'SELECT * FROM users WHERE id = ? AND role = "doctor"',
      [doctorId]
    );
    
    if (doctors.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลหมอ' });
    }
    
    // ตรวจสอบว่าหมอไม่สะดวกในวันนั้นหรือไม่
    const [unavailableDates] = await pool.query(
      'SELECT * FROM unavailable_dates WHERE doctor_id = ? AND date = ?',
      [doctorId, date]
    );
    
    if (unavailableDates.length > 0) {
      return res.status(400).json({ 
        error: 'หมอไม่สะดวกในวันนี้',
        reason: unavailableDates[0].reason || 'ไม่ได้ระบุเหตุผล'
      });
    }
    
    // ตรวจสอบว่ามีตารางเวรซ้ำหรือไม่
    const [existingSchedules] = await pool.query(
      'SELECT * FROM schedules WHERE doctor_id = ? AND date = ? AND shift = ?',
      [doctorId, date, shift]
    );
    
    if (existingSchedules.length > 0) {
      return res.status(400).json({ error: 'มีตารางเวรซ้ำ' });
    }
    
    // สร้างตารางเวรใหม่
    const [result] = await pool.query(
      'INSERT INTO schedules (doctor_id, date, shift, created_by) VALUES (?, ?, ?, ?)',
      [doctorId, date, shift, req.session.user.id]
    );
    
    // ดึงข้อมูลที่เพิ่งสร้าง
    const [newSchedule] = await pool.query(
      `SELECT s.*, u.name as doctor_name, DATE_FORMAT(s.date, '%Y-%m-%d') as formatted_date 
       FROM schedules s 
       JOIN users u ON s.doctor_id = u.id 
       WHERE s.id = ?`,
      [result.insertId]
    );
    
    res.status(201).json({ 
      message: 'สร้างตารางเวรเรียบร้อยแล้ว', 
      data: newSchedule[0] 
    });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างตารางเวร' });
  }
});

// ลบตารางเวร
router.delete('/schedules/:id', checkAuth, checkAdmin, async (req, res) => {
  try {
    const scheduleId = req.params.id;
    
    // ตรวจสอบว่ามีตารางเวรนี้หรือไม่
    const [schedules] = await pool.query(
      'SELECT * FROM schedules WHERE id = ?',
      [scheduleId]
    );
    
    if (schedules.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลตารางเวร' });
    }
    
    // ลบตารางเวร
    await pool.query(
      'DELETE FROM schedules WHERE id = ?',
      [scheduleId]
    );
    
    res.json({ message: 'ลบตารางเวรเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบตารางเวร' });
  }
});

// ดูตารางเวรเดือนเฉพาะ
router.get('/schedules/:year/:month', checkAuth, checkAdmin, async (req, res) => {
  try {
    const { year, month } = req.params;
    
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
      `SELECT s.*, u.name as doctor_name, DATE_FORMAT(s.date, '%Y-%m-%d') as formatted_date 
       FROM schedules s 
       JOIN users u ON s.doctor_id = u.id 
       WHERE s.date BETWEEN ? AND ? 
       ORDER BY s.date, s.shift`,
      [startDate, endDate]
    );
    
    // ดึงข้อมูลวันที่หมอไม่สะดวก
    const [unavailableDates] = await pool.query(
      `SELECT ud.*, u.name as doctor_name, DATE_FORMAT(ud.date, '%Y-%m-%d') as formatted_date 
       FROM unavailable_dates ud 
       JOIN users u ON ud.doctor_id = u.id 
       WHERE ud.date BETWEEN ? AND ? 
       ORDER BY ud.date, u.name`,
      [startDate, endDate]
    );
    
    res.json({ 
      schedules,
      unavailableDates,
      month: monthNum,
      year: yearNum
    });
  } catch (error) {
    console.error('Error fetching monthly schedules:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลตารางเวร' });
  }
});

// สร้างตารางเวรอัตโนมัติ
router.post('/auto-schedule', checkAuth, checkAdmin, async (req, res) => {
  try {
    const { month, year, rules } = req.body;
    
    // ตรวจสอบความถูกต้องของข้อมูล
    if (!month || !year) {
      return res.status(400).json({ error: 'กรุณาระบุเดือนและปี' });
    }
    
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'ข้อมูลเดือนหรือปีไม่ถูกต้อง' });
    }
    
    // ดึงข้อมูลหมอทั้งหมด
    const [doctors] = await pool.query(
      'SELECT id, name FROM users WHERE role = "doctor" ORDER BY name'
    );
    
    if (doctors.length === 0) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลหมอในระบบ' });
    }
    
    // กำหนดค่าเริ่มต้นของเดือน
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0);
    const daysInMonth = endDate.getDate();
    
    // ดึงข้อมูลวันที่หมอไม่สะดวก
    const [unavailableDates] = await pool.query(
      `SELECT * FROM unavailable_dates 
       WHERE date BETWEEN ? AND ?`,
      [startDate, endDate]
    );
    
    // ดึงข้อมูลตารางเวรที่มีอยู่แล้ว
    const [existingSchedules] = await pool.query(
      `SELECT * FROM schedules 
       WHERE date BETWEEN ? AND ?`,
      [startDate, endDate]
    );
    
    // กำหนดเวร
    const shifts = ['morning', 'afternoon', 'night'];
    const newSchedules = [];
    
    // สร้างตารางเวรอัตโนมัติ
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(yearNum, monthNum - 1, day);
      const formattedDate = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      for (const shift of shifts) {
        // ตรวจสอบว่ามีตารางเวรอยู่แล้วหรือไม่
        const hasExistingSchedule = existingSchedules.some(
          schedule => 
            new Date(schedule.date).getDate() === day && 
            schedule.shift === shift
        );
        
        if (hasExistingSchedule) {
          continue; // ข้ามไปวันถัดไป ถ้ามีตารางเวรอยู่แล้ว
        }
        
        // หาหมอที่พร้อมอยู่เวร
        const availableDoctors = doctors.filter(doctor => {
          // ตรวจสอบว่าหมอไม่ได้ลงว่าไม่สะดวกในวันนี้
          const isUnavailable = unavailableDates.some(
            date => 
              date.doctor_id === doctor.id && 
              new Date(date.date).getDate() === day
          );
          
          if (isUnavailable) {
            return false;
          }
          
          // ตรวจสอบว่าหมอไม่ได้อยู่เวรในวันนี้แล้ว
          const hasShiftToday = newSchedules.some(
            schedule => 
              schedule.doctor_id === doctor.id && 
              schedule.date === formattedDate
          );
          
          if (hasShiftToday) {
            return false;
          }
          
          // ตรวจสอบว่าหมอไม่ได้อยู่เวรในวันก่อนหน้า (เวรดึก)
          if (day > 1 && shift === 'morning') {
            const previousDate = new Date(yearNum, monthNum - 1, day - 1);
            const formattedPrevDate = previousDate.toISOString().split('T')[0];
            
            const hadNightShiftYesterday = existingSchedules.some(
              schedule => 
                schedule.doctor_id === doctor.id && 
                new Date(schedule.date).getDate() === day - 1 && 
                schedule.shift === 'night'
            ) || newSchedules.some(
              schedule => 
                schedule.doctor_id === doctor.id && 
                schedule.date === formattedPrevDate && 
                schedule.shift === 'night'
            );
            
            if (hadNightShiftYesterday) {
              return false;
            }
          }
          
          return true;
        });
        
        if (availableDoctors.length > 0) {
          // หาหมอที่มีจำนวนเวรน้อยที่สุด
          const doctorShiftCounts = availableDoctors.map(doctor => {
            const existingCount = existingSchedules.filter(
              schedule => schedule.doctor_id === doctor.id
            ).length;
            
            const newCount = newSchedules.filter(
              schedule => schedule.doctor_id === doctor.id
            ).length;
            
            return {
              doctor,
              count: existingCount + newCount
            };
          });
          
          // เรียงลำดับตามจำนวนเวร
          doctorShiftCounts.sort((a, b) => a.count - b.count);
          
          // เลือกหมอที่มีจำนวนเวรน้อยที่สุด
          const selectedDoctor = doctorShiftCounts[0].doctor;
          
          // เพิ่มตารางเวรใหม่
          newSchedules.push({
            doctor_id: selectedDoctor.id,
            date: formattedDate,
            shift,
            doctor_name: selectedDoctor.name
          });
        }
      }
    }
    
    // บันทึกตารางเวรทั้งหมดลงฐานข้อมูล
    const createdSchedules = [];
    
    for (const schedule of newSchedules) {
      const [result] = await pool.query(
        'INSERT INTO schedules (doctor_id, date, shift, created_by) VALUES (?, ?, ?, ?)',
        [schedule.doctor_id, schedule.date, schedule.shift, req.session.user.id]
      );
      
      schedule.id = result.insertId;
      createdSchedules.push(schedule);
    }
    
    res.json({ 
      message: `สร้างตารางเวรอัตโนมัติสำเร็จ ${createdSchedules.length} รายการ`, 
      schedules: createdSchedules 
    });
  } catch (error) {
    console.error('Error generating auto schedule:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างตารางเวรอัตโนมัติ' });
  }
});

module.exports = router;