// ส่วนของปฏิทิน
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// ฟังก์ชันสร้างปฏิทิน
function generateCalendar(year, month) {
  const calendarDays = document.getElementById('calendar-days');
  if (!calendarDays) return; // ตรวจสอบว่ามีองค์ประกอบนี้หรือไม่
  
  calendarDays.innerHTML = '';
  
  // กำหนดวันแรกของเดือน
  const firstDay = new Date(year, month, 1);
  // กำหนดวันสุดท้ายของเดือน
  const lastDay = new Date(year, month + 1, 0);
  
  // วันแรกของเดือนเริ่มที่วันอะไร (0 = วันอาทิตย์, 6 = วันเสาร์)
  const firstDayIndex = firstDay.getDay();
  
  // จำนวนวันในเดือน
  const daysInMonth = lastDay.getDate();
  
  // สร้างช่องว่างสำหรับวันก่อนหน้าเดือนปัจจุบัน
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyDay = document.createElement('div');
    emptyDay.className = 'calendar-day empty';
    calendarDays.appendChild(emptyDay);
  }
  
  // สร้างวันในเดือนปัจจุบัน
  for (let day = 1; day <= daysInMonth; day++) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    
    // ส่วนหัวของวัน
    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    dayHeader.textContent = day;
    
    // ตรวจสอบว่าเป็นวันหยุดหรือไม่
    const currentDate = new Date(year, month, day);
    if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
      dayHeader.classList.add('weekend');
    }
    
    // ส่วนของตารางเวร
    const dayShifts = document.createElement('div');
    dayShifts.className = 'day-shifts';
    
    // ตรงนี้จะเติมเวรจากฐานข้อมูล
    fetchShiftsForDay(year, month, day, dayShifts);
    
    // เพิ่มปุ่มเพิ่มเวร
    const addShiftBtn = document.createElement('button');
    addShiftBtn.className = 'add-shift-btn';
    addShiftBtn.textContent = '+';
    addShiftBtn.onclick = function() {
      showAddShiftModal();
      
      // กำหนดวันที่ในฟอร์ม
      const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      document.getElementById('shiftDate').value = formattedDate;
    };
    
    dayElement.appendChild(dayHeader);
    dayElement.appendChild(dayShifts);
    dayElement.appendChild(addShiftBtn);
    
    calendarDays.appendChild(dayElement);
  }
}

// ฟังก์ชันดึงข้อมูลเวรสำหรับวันที่กำหนด
function fetchShiftsForDay(year, month, day, container) {
  const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  fetch(`/admin/schedules/date/${date}`)
    .then(response => response.json())
    .then(data => {
      container.innerHTML = '';
      
      if (!data || data.length === 0) {
        return;
      }
      
      data.forEach(shift => {
        const shiftItem = document.createElement('div');
        shiftItem.className = 'shift-item';
        shiftItem.textContent = `${shift.shift_type_name || shift.shift}: ${shift.doctor_name}`;
        shiftItem.onclick = function() {
          // แสดง modal แก้ไขเวร (ถ้ามี)
        };
        
        container.appendChild(shiftItem);
      });
    })
    .catch(error => {
      console.error('Error fetching shifts:', error);
    });
}

function updateCalendar() {
  const currentMonthElem = document.getElementById('current-month');
  const currentYearElem = document.getElementById('current-year');
  
  if (currentMonthElem && currentYearElem) {
    currentMonthElem.textContent = new Date(currentYear, currentMonth, 1).toLocaleString('th-TH', { month: 'long' });
    currentYearElem.textContent = currentYear + 543; // พ.ศ.
    generateCalendar(currentYear, currentMonth);
  }
}

function previousMonth() {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  updateCalendar();
}

function nextMonth() {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  updateCalendar();
}

function filterDepartment() {
  // อัพเดทปฏิทินตามแผนกที่เลือก
  updateCalendar();
}

// เพิ่ม event listener สำหรับการเปลี่ยน tab เพื่ออัพเดทปฏิทิน
document.addEventListener('DOMContentLoaded', function() {
  // ตรวจสอบว่าเปิด tab calendar หรือไม่
  const tablinks = document.getElementsByClassName("tab");
  for (let i = 0; i < tablinks.length; i++) {
    tablinks[i].addEventListener("click", function() {
      if (this.textContent.includes("ปฏิทิน")) {
        setTimeout(() => {
          updateCalendar();
        }, 100);
      }
    });
  }

  // เพิ่ม API endpoint สำหรับดึงข้อมูลเวรตามวันที่
  // สร้าง route ใน admin.js
  // router.get('/schedules/date/:date', checkAuth, async (req, res) => { ... });
});