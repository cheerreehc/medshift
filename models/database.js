// models/database.js
const mysql = require('mysql2/promise');

// สร้าง database pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'viteetum_medshift',
  password: process.env.DB_PASSWORD || 'e8Tb63m9^',
  database: process.env.DB_NAME || 'medshift_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ฟังก์ชันสำหรับทดสอบการเชื่อมต่อ
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully!');
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// ฟังก์ชันสำหรับสร้างตาราง
async function setupDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // สร้างตาราง users
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role ENUM('doctor', 'admin') NOT NULL DEFAULT 'doctor',
        email VARCHAR(100),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // สร้างตาราง unavailable_dates
    await connection.query(`
      CREATE TABLE IF NOT EXISTS unavailable_dates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doctor_id INT NOT NULL,
        date DATE NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // สร้างตาราง schedules
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doctor_id INT NOT NULL,
        date DATE NOT NULL,
        shift ENUM('morning', 'afternoon', 'night') NOT NULL,
        status ENUM('scheduled', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    console.log('Tables created successfully!');
    
    // ตรวจสอบว่ามี admin อยู่แล้วหรือไม่
    const [adminRows] = await connection.query('SELECT * FROM users WHERE role = "admin" LIMIT 1');
    
    // ถ้ายังไม่มี admin ให้สร้าง admin เริ่มต้น
    if (adminRows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await connection.query(`
        INSERT INTO users (username, password, name, role, email)
        VALUES ('admin', ?, 'System Administrator', 'admin', 'admin@medshift.com')
      `, [hashedPassword]);
      
      console.log('Default admin user created!');
    }
    
    connection.release();
    return true;
  } catch (error) {
    console.error('Error setting up database:', error);
    return false;
  }
}

module.exports = {
  pool,
  testConnection,
  setupDatabase
};