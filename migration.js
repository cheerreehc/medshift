// migration-update.js - สคริปต์สำหรับการอัพเกรดฐานข้อมูล MedShift เป็นโครงสร้างใหม่

// เรียกใช้ library ที่จำเป็น
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// โหลด environment variables
dotenv.config();

// กำหนดค่าการเชื่อมต่อฐานข้อมูล
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'viteetum_medshift',
  password: process.env.DB_PASSWORD || 'e8Tb63m9^',
  database: process.env.DB_NAME || 'medshift_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// สร้างการเชื่อมต่อกับฐานข้อมูล
async function connectToDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database
    });
    
    console.log('เชื่อมต่อกับฐานข้อมูลสำเร็จ!');
    return connection;
  } catch (error) {
    console.error('ไม่สามารถเชื่อมต่อกับฐานข้อมูล:', error);
    process.exit(1);
  }
}

// ฟังก์ชันตรวจสอบว่าตารางมีอยู่แล้วหรือไม่
async function checkTableExists(connection, tableName) {
  try {
    const [rows] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    `, [dbConfig.database, tableName]);
    
    return rows.length > 0;
  } catch (error) {
    console.error(`เกิดข้อผิดพลาดในการตรวจสอบตาราง ${tableName}:`, error);
    return false;
  }
}

// ฟังก์ชันตรวจสอบว่าคอลัมน์มีอยู่แล้วหรือไม่
async function checkColumnExists(connection, tableName, columnName) {
  try {
    const [columns] = await connection.query(`
      SHOW COLUMNS FROM ${tableName} LIKE ?
    `, [columnName]);
    
    return columns.length > 0;
  } catch (error) {
    console.error(`เกิดข้อผิดพลาดในการตรวจสอบคอลัมน์ ${columnName} ในตาราง ${tableName}:`, error);
    return false;
  }
}

// ฟังก์ชันอัพเกรดฐานข้อมูล
async function upgradeDatabaseSchema(connection) {
  try {
    console.log('เริ่มต้นการอัพเกรดโครงสร้างฐานข้อมูล...');
    
    // 1. สร้างตาราง ward_departments (ถ้ายังไม่มี)
    const wardDepartmentsExists = await checkTableExists(connection, 'ward_departments');
    if (!wardDepartmentsExists) {
      console.log('กำลังสร้างตาราง ward_departments...');
      await connection.query(`
        CREATE TABLE ward_departments (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(100) NOT NULL COMMENT 'ชื่อแผนก เช่น อายุรกรรม, ศัลยกรรม',
          short_name VARCHAR(20) DEFAULT NULL COMMENT 'ชื่อย่อ เช่น MED, SUR',
          description TEXT DEFAULT NULL COMMENT 'รายละเอียดแผนก',
          is_active TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      console.log('สร้างตาราง ward_departments สำเร็จ');
    }
    
    // 2. สร้างตาราง doctor_positions (ถ้ายังไม่มี)
    const doctorPositionsExists = await checkTableExists(connection, 'doctor_positions');
    if (!doctorPositionsExists) {
      console.log('กำลังสร้างตาราง doctor_positions...');
      await connection.query(`
        CREATE TABLE doctor_positions (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(100) NOT NULL COMMENT 'ชื่อตำแหน่ง เช่น แพทย์ที่, วาส, ประจำ',
          short_name VARCHAR(20) DEFAULT NULL COMMENT 'ชื่อย่อ',
          description TEXT DEFAULT NULL COMMENT 'รายละเอียดตำแหน่ง',
          is_active TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      console.log('สร้างตาราง doctor_positions สำเร็จ');
    }
    
    // 3. สร้างตาราง specialties (ถ้ายังไม่มี)
    const specialtiesExists = await checkTableExists(connection, 'specialties');
    if (!specialtiesExists) {
      console.log('กำลังสร้างตาราง specialties...');
      await connection.query(`
        CREATE TABLE specialties (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(100) NOT NULL COMMENT 'ชื่อความเชี่ยวชาญ เช่น Cardio, GI',
          short_name VARCHAR(20) DEFAULT NULL COMMENT 'ชื่อย่อ',
          description TEXT DEFAULT NULL COMMENT 'รายละเอียดความเชี่ยวชาญ',
          department_id INT DEFAULT NULL COMMENT 'แผนกที่เกี่ยวข้อง (ถ้ามี)',
          is_active TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY department_id (department_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      
      // เพิ่ม Foreign Key หลังจากสร้างตาราง
      await connection.query(`
        ALTER TABLE specialties
        ADD CONSTRAINT specialties_ibfk_1 FOREIGN KEY (department_id) REFERENCES ward_departments (id) ON DELETE SET NULL
      `);
      
      console.log('สร้างตาราง specialties สำเร็จ');
    }
    
    // 4. อัพเดทตาราง users (เพิ่มคอลัมน์ใหม่)
    const usersExists = await checkTableExists(connection, 'users');
    if (usersExists) {
      console.log('กำลังตรวจสอบและอัพเดทตาราง users...');
      
      // ตรวจสอบและเพิ่มคอลัมน์ position_id
      const positionIdExists = await checkColumnExists(connection, 'users', 'position_id');
      if (!positionIdExists) {
        await connection.query(`
          ALTER TABLE users
          ADD COLUMN position_id INT DEFAULT NULL COMMENT 'ตำแหน่งของแพทย์'
        `);
        console.log('เพิ่มคอลัมน์ position_id ในตาราง users สำเร็จ');
      }
      
      // ตรวจสอบและเพิ่มคอลัมน์ department_id
      const departmentIdExists = await checkColumnExists(connection, 'users', 'department_id');
      if (!departmentIdExists) {
        await connection.query(`
          ALTER TABLE users
          ADD COLUMN department_id INT DEFAULT NULL COMMENT 'แผนกหลัก'
        `);
        console.log('เพิ่มคอลัมน์ department_id ในตาราง users สำเร็จ');
      }
      
      // ตรวจสอบและเพิ่มคอลัมน์ specialty_id
      const specialtyIdExists = await checkColumnExists(connection, 'users', 'specialty_id');
      if (!specialtyIdExists) {
        await connection.query(`
          ALTER TABLE users
          ADD COLUMN specialty_id INT DEFAULT NULL COMMENT 'ความเชี่ยวชาญหลัก'
        `);
        console.log('เพิ่มคอลัมน์ specialty_id ในตาราง users สำเร็จ');
      }
      
      // ตรวจสอบและเพิ่มคอลัมน์ employee_id
      const employeeIdExists = await checkColumnExists(connection, 'users', 'employee_id');
      if (!employeeIdExists) {
        await connection.query(`
          ALTER TABLE users
          ADD COLUMN employee_id VARCHAR(20) DEFAULT NULL COMMENT 'รหัสพนักงาน/แพทย์'
        `);
        console.log('เพิ่มคอลัมน์ employee_id ในตาราง users สำเร็จ');
      }
      
      // ตรวจสอบและเพิ่มคอลัมน์ is_available
      const isAvailableExists = await checkColumnExists(connection, 'users', 'is_available');
      if (!isAvailableExists) {
        await connection.query(`
          ALTER TABLE users
          ADD COLUMN is_available TINYINT(1) DEFAULT 1 COMMENT 'สถานะพร้อมปฏิบัติงาน'
        `);
        console.log('เพิ่มคอลัมน์ is_available ในตาราง users สำเร็จ');
      }
      
      // ตรวจสอบและเพิ่มคอลัมน์ start_date
      const startDateExists = await checkColumnExists(connection, 'users', 'start_date');
      if (!startDateExists) {
        await connection.query(`
          ALTER TABLE users
          ADD COLUMN start_date DATE DEFAULT NULL COMMENT 'วันที่เริ่มทำงาน'
        `);
        console.log('เพิ่มคอลัมน์ start_date ในตาราง users สำเร็จ');
      }
      
      // ตรวจสอบและเพิ่มคอลัมน์ end_date
      const endDateExists = await checkColumnExists(connection, 'users', 'end_date');
      if (!endDateExists) {
        await connection.query(`
          ALTER TABLE users
          ADD COLUMN end_date DATE DEFAULT NULL COMMENT 'วันที่สิ้นสุดการทำงาน (ถ้ามี)'
        `);
        console.log('เพิ่มคอลัมน์ end_date ในตาราง users สำเร็จ');
      }
      
      // เพิ่ม Foreign Keys
      try {
        await connection.query(`
          ALTER TABLE users
          ADD CONSTRAINT users_ibfk_1 FOREIGN KEY (position_id) REFERENCES doctor_positions (id) ON DELETE SET NULL,
          ADD CONSTRAINT users_ibfk_2 FOREIGN KEY (department_id) REFERENCES ward_departments (id) ON DELETE SET NULL,
          ADD CONSTRAINT users_ibfk_3 FOREIGN KEY (specialty_id) REFERENCES specialties (id) ON DELETE SET NULL
        `);
        console.log('เพิ่ม Foreign Keys ในตาราง users สำเร็จ');
      } catch (error) {
        // อาจมีข้อผิดพลาดหากมี foreign key อยู่แล้ว
        console.log('Foreign Keys อาจมีอยู่แล้วหรือมีข้อผิดพลาด:', error.message);
      }
    }
    
    // 5. สร้างตาราง doctor_specialties (ถ้ายังไม่มี)
    const doctorSpecialtiesExists = await checkTableExists(connection, 'doctor_specialties');
    if (!doctorSpecialtiesExists) {
      console.log('กำลังสร้างตาราง doctor_specialties...');
      await connection.query(`
        CREATE TABLE doctor_specialties (
          id INT NOT NULL AUTO_INCREMENT,
          doctor_id INT NOT NULL,
          specialty_id INT NOT NULL,
          is_primary TINYINT(1) DEFAULT 0 COMMENT 'เป็นความเชี่ยวชาญหลักหรือไม่',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY unique_doctor_specialty (doctor_id, specialty_id),
          KEY specialty_id (specialty_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      
      // เพิ่ม Foreign Keys
      await connection.query(`
        ALTER TABLE doctor_specialties
        ADD CONSTRAINT doctor_specialties_ibfk_1 FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE CASCADE,
        ADD CONSTRAINT doctor_specialties_ibfk_2 FOREIGN KEY (specialty_id) REFERENCES specialties (id) ON DELETE CASCADE
      `);
      
      console.log('สร้างตาราง doctor_specialties สำเร็จ');
    }
    
    // 6. สร้างตาราง holidays (ถ้ายังไม่มี)
    const holidaysExists = await checkTableExists(connection, 'holidays');
    if (!holidaysExists) {
      console.log('กำลังสร้างตาราง holidays...');
      await connection.query(`
        CREATE TABLE holidays (
          id INT NOT NULL AUTO_INCREMENT,
          date DATE NOT NULL,
          name VARCHAR(100) NOT NULL COMMENT 'ชื่อวันหยุด',
          description TEXT DEFAULT NULL COMMENT 'รายละเอียดวันหยุด',
          is_government_holiday TINYINT(1) DEFAULT 1 COMMENT 'เป็นวันหยุดราชการหรือไม่',
          is_hospital_holiday TINYINT(1) DEFAULT 1 COMMENT 'เป็นวันหยุดของโรงพยาบาลหรือไม่',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY unique_holiday_date (date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      
      // เพิ่มข้อมูลตัวอย่าง
      await connection.query(`
        INSERT INTO holidays (date, name, is_government_holiday, is_hospital_holiday)
        VALUES 
        ('2025-01-01', 'วันขึ้นปีใหม่', 1, 1),
        ('2025-04-13', 'วันสงกรานต์', 1, 1),
        ('2025-04-14', 'วันสงกรานต์', 1, 1),
        ('2025-04-15', 'วันสงกรานต์', 1, 1)
      `);
      
      console.log('สร้างตาราง holidays และเพิ่มข้อมูลตัวอย่างสำเร็จ');
    }
    
    // 7. สร้างตาราง locations (ถ้ายังไม่มี)
    const locationsExists = await checkTableExists(connection, 'locations');
    if (!locationsExists) {
      console.log('กำลังสร้างตาราง locations...');
      await connection.query(`
        CREATE TABLE locations (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(100) NOT NULL COMMENT 'ชื่อสถานที่ เช่น OPD ชั้น 1',
          short_name VARCHAR(20) DEFAULT NULL COMMENT 'ชื่อย่อ',
          description TEXT DEFAULT NULL COMMENT 'รายละเอียดสถานที่',
          department_id INT DEFAULT NULL COMMENT 'แผนกที่เกี่ยวข้อง (ถ้ามี)',
          is_active TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY department_id (department_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      
      // เพิ่ม Foreign Key
      await connection.query(`
        ALTER TABLE locations
        ADD CONSTRAINT locations_ibfk_1 FOREIGN KEY (department_id) REFERENCES ward_departments (id) ON DELETE SET NULL
      `);
      
      console.log('สร้างตาราง locations สำเร็จ');
    }
    
    // 8. สร้างตาราง shift_types (ถ้ายังไม่มี)
    const shiftTypesExists = await checkTableExists(connection, 'shift_types');
    if (!shiftTypesExists) {
      console.log('กำลังสร้างตาราง shift_types...');
      await connection.query(`
        CREATE TABLE shift_types (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(100) NOT NULL COMMENT 'ชื่อประเภทเวร เช่น 1st call, OPD',
          short_name VARCHAR(20) DEFAULT NULL COMMENT 'ชื่อย่อ',
          description TEXT DEFAULT NULL COMMENT 'รายละเอียดประเภทเวร',
          department_id INT DEFAULT NULL COMMENT 'แผนกที่เกี่ยวข้อง (ถ้ามี)',
          start_time TIME DEFAULT NULL COMMENT 'เวลาเริ่มเวร',
          end_time TIME DEFAULT NULL COMMENT 'เวลาสิ้นสุดเวร',
          is_active TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY department_id (department_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      
      // เพิ่ม Foreign Key
      await connection.query(`
        ALTER TABLE shift_types
        ADD CONSTRAINT shift_types_ibfk_1 FOREIGN KEY (department_id) REFERENCES ward_departments (id) ON DELETE SET NULL
      `);
      
      console.log('สร้างตาราง shift_types สำเร็จ');
    }
    
    // 9. สร้างตาราง schedule_periods (ถ้ายังไม่มี)
    const schedulePeriodsExists = await checkTableExists(connection, 'schedule_periods');
    if (!schedulePeriodsExists) {
      console.log('กำลังสร้างตาราง schedule_periods...');
      await connection.query(`
        CREATE TABLE schedule_periods (
          id INT NOT NULL AUTO_INCREMENT,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          name VARCHAR(100) DEFAULT NULL COMMENT 'ชื่อรอบการจัดเวร',
          department_id INT DEFAULT NULL,
          status ENUM('draft','published','archived') DEFAULT 'draft',
          created_by INT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY department_id (department_id),
          KEY created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      
      // เพิ่ม Foreign Keys
      await connection.query(`
        ALTER TABLE schedule_periods
        ADD CONSTRAINT schedule_periods_ibfk_1 FOREIGN KEY (department_id) REFERENCES ward_departments (id) ON DELETE SET NULL,
        ADD CONSTRAINT schedule_periods_ibfk_2 FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE NO ACTION
      `);
      
      console.log('สร้างตาราง schedule_periods สำเร็จ');
    }
    
    // 10. อัพเดทตาราง schedules (สร้างใหม่หรืออัพเดท)
    const schedulesExists = await checkTableExists(connection, 'schedules');
    if (!schedulesExists) {
      console.log('กำลังสร้างตาราง schedules...');
      await connection.query(`
        CREATE TABLE schedules (
          id INT NOT NULL AUTO_INCREMENT,
          doctor_id INT NOT NULL,
          shift_type_id INT NOT NULL,
          date DATE NOT NULL,
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          location_id INT DEFAULT NULL,
          notes TEXT DEFAULT NULL COMMENT 'บันทึกเพิ่มเติม',
          status ENUM('scheduled','completed','cancelled') DEFAULT 'scheduled',
          created_by INT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY doctor_id (doctor_id),
          KEY shift_type_id (shift_type_id),
          KEY location_id (location_id),
          KEY created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      
      // เพิ่ม Foreign Keys
      await connection.query(`
        ALTER TABLE schedules
        ADD CONSTRAINT schedules_ibfk_1 FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE CASCADE,
        ADD CONSTRAINT schedules_ibfk_2 FOREIGN KEY (shift_type_id) REFERENCES shift_types (id) ON DELETE CASCADE,
        ADD CONSTRAINT schedules_ibfk_3 FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE SET NULL,
        ADD CONSTRAINT schedules_ibfk_4 FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE NO ACTION
      `);
      
      console.log('สร้างตาราง schedules สำเร็จ');
    } else {
      // ตรวจสอบและปรับโครงสร้างตาราง schedules ถ้ามีอยู่แล้ว
      console.log('กำลังตรวจสอบและอัพเดทตาราง schedules...');
      
      // ตรวจสอบและเพิ่มคอลัมน์ที่จำเป็น
      const columns = [
        { name: 'shift_type_id', definition: 'INT NOT NULL' },
        { name: 'start_time', definition: 'TIME NOT NULL' },
        { name: 'end_time', definition: 'TIME NOT NULL' },
        { name: 'location_id', definition: 'INT DEFAULT NULL' },
        { name: 'notes', definition: 'TEXT DEFAULT NULL COMMENT \'บันทึกเพิ่มเติม\'' }
      ];
      
      for (const column of columns) {
        const columnExists = await checkColumnExists(connection, 'schedules', column.name);
        if (!columnExists) {
          await connection.query(`
            ALTER TABLE schedules
            ADD COLUMN ${column.name} ${column.definition}
          `);
          console.log(`เพิ่มคอลัมน์ ${column.name} ในตาราง schedules สำเร็จ`);
        }
      }
    }
    
    // 11. สร้างตาราง shift_exchanges (ถ้ายังไม่มี)
    const shiftExchangesExists = await checkTableExists(connection, 'shift_exchanges');
    if (!shiftExchangesExists) {
      console.log('กำลังสร้างตาราง shift_exchanges...');
      await connection.query(`
        CREATE TABLE shift_exchanges (
          id INT NOT NULL AUTO_INCREMENT,
          original_schedule_id INT NOT NULL,
          new_doctor_id INT NOT NULL,
          requested_by INT NOT NULL,
          approved_by INT DEFAULT NULL,
          reason TEXT DEFAULT NULL,
          status ENUM('pending','approved','rejected','cancelled') DEFAULT 'pending',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY original_schedule_id (original_schedule_id),
          KEY new_doctor_id (new_doctor_id),
          KEY requested_by (requested_by),
          KEY approved_by (approved_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      
      // เพิ่ม Foreign Keys
      await connection.query(`
        ALTER TABLE shift_exchanges
        ADD CONSTRAINT shift_exchanges_ibfk_1 FOREIGN KEY (original_schedule_id) REFERENCES schedules (id) ON DELETE CASCADE,
        ADD CONSTRAINT shift_exchanges_ibfk_2 FOREIGN KEY (new_doctor_id) REFERENCES users (id) ON DELETE CASCADE,
        ADD CONSTRAINT shift_exchanges_ibfk_3 FOREIGN KEY (requested_by) REFERENCES users (id) ON DELETE NO ACTION,
        ADD CONSTRAINT shift_exchanges_ibfk_4 FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
      `);
      
      console.log('สร้างตาราง shift_exchanges สำเร็จ');
    }
    
    // 12. สร้างตาราง unavailable_dates (ถ้ายังไม่มี)
    const unavailableDatesExists = await checkTableExists(connection, 'unavailable_dates');
    if (!unavailableDatesExists) {
      console.log('กำลังสร้างตาราง unavailable_dates...');
      await connection.query(`
        CREATE TABLE unavailable_dates (
          id INT NOT NULL AUTO_INCREMENT,
          doctor_id INT NOT NULL,
          date DATE NOT NULL,
          reason TEXT DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY doctor_id (doctor_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);
      
      // เพิ่ม Foreign Key
      await connection.query(`
        ALTER TABLE unavailable_dates
        ADD CONSTRAINT unavailable_dates_ibfk_1 FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE CASCADE
      `);
      
      console.log('สร้างตาราง unavailable_dates สำเร็จ');
    }
    
    console.log('การอัพเกรดโครงสร้างฐานข้อมูลเสร็จสมบูรณ์!');
    return true;
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการอัพเกรดฐานข้อมูล:', error);
    return false;
  }
}

// ฟังก์ชันหลักสำหรับการทำ migration
async function runMigration() {
  let connection;
  try {
    connection = await connectToDatabase();
    const success = await upgradeDatabaseSchema(connection);
    
    if (success) {
      console.log('===================================');
      console.log('      การ Migration สำเร็จ!');
      console.log('===================================');
    } else {
      console.error('=============================');
      console.error('   การ Migration ล้มเหลว!');
      console.error('=============================');
    }
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการ migration:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('ปิดการเชื่อมต่อกับฐานข้อมูล');
    }
    process.exit(0);
  }
}

// เริ่มต้นการทำงาน
runMigration();