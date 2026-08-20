import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Users, LayoutDashboard, Plus, Trash2, X, Copy,
  Download, Upload, Settings, Edit, MapPin
} from 'lucide-react';
import { supabase, configError } from './supabaseClient';

// ===== แปลงข้อมูลระหว่างรูปแบบในฐานข้อมูล (snake_case) กับในแอป (camelCase) =====
const rowToJob = (r) => ({
  id: r.id,
  name: r.name || '',
  client: r.client || '',
  location: r.location || '',
  mapUrl: r.map_url || '',
  status: r.status,
  color: r.color || '',
  assignedStaffIds: r.assigned_staff_ids || [],
  phases: r.phases || [],
  dailyOverrides: r.daily_overrides || {},
});

const jobToRow = (j) => ({
  id: j.id,
  name: j.name,
  client: j.client || '',
  location: j.location || '',
  map_url: j.mapUrl || '',
  status: j.status,
  color: j.color || '',
  assigned_staff_ids: j.assignedStaffIds || [],
  phases: j.phases || [],
  daily_overrides: j.dailyOverrides || {},
});

const rowToStaff = (r) => ({
  id: r.id,
  name: r.name || '',
  role: r.role,
  phone: r.phone || '',
  headcount: r.headcount || 1,
});

const staffToRow = (s) => ({
  id: s.id,
  name: s.name,
  role: s.role,
  phone: s.phone || '',
  headcount: s.headcount || 1,
});

const ROLES = ['Setup', 'Lighting Designer', 'Lighting Operator', 'LED', 'Sale & Marketing', 'Outsource Team'];
const CUSTOM_ROLE = '__custom__';   // ค่าพิเศษ: ผู้ใช้เลือก "อื่นๆ" แล้วพิมพ์ตำแหน่งเอง

// ตัวเลือกการจัดเรียงในหน้าตารางคิว
const SORT_OPTIONS = [
  { value: 'role',  label: 'ตามตำแหน่ง (จัดกลุ่ม)' },
  { value: 'name',  label: 'ตามตัวอักษรชื่อ ก-ฮ' },
  { value: 'busy',  label: 'คนงานเยอะอยู่บน' },
  { value: 'free',  label: 'คนว่างอยู่บน' },
];

const JOB_STATUSES = {
  PENDING: 'รอยืนยัน',
  CONFIRMED: 'ยืนยันแล้ว',
  CANCELLED: 'ยกเลิก'
};

const STATUS_COLORS = {
  'รอยืนยัน': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'ยืนยันแล้ว': 'bg-green-100 text-green-800 border-green-200',
  'ยกเลิก': 'bg-red-100 text-red-800 border-red-200'
};

const PHASE_TYPES = ['Load in', 'Setup', 'Rehearsal', 'Runthrough', 'Show Day', 'Dismantle'];

const PHASE_COLORS = {
  'Load in': 'bg-orange-500',
  'Setup': 'bg-blue-500',
  'Rehearsal': 'bg-yellow-600',
  'Runthrough': 'bg-purple-500',
  'Show Day': 'bg-green-600',
  'Dismantle': 'bg-rose-700'
};

const getPhaseColor = (type) => PHASE_COLORS[type] || 'bg-teal-600';

const JOB_COLORS = [
  { name: 'สีตามสถานะ', value: '' },
  { name: 'ฟ้า', value: 'bg-blue-100 text-blue-800 border-blue-400' },
  { name: 'เขียว', value: 'bg-green-100 text-green-800 border-green-400' },
  { name: 'เหลือง', value: 'bg-yellow-100 text-yellow-800 border-yellow-400' },
  { name: 'แดง', value: 'bg-red-100 text-red-800 border-red-400' },
  { name: 'ม่วง', value: 'bg-purple-100 text-purple-800 border-purple-400' },
  { name: 'ชมพู', value: 'bg-pink-100 text-pink-800 border-pink-400' },
  { name: 'ส้ม', value: 'bg-orange-100 text-orange-800 border-orange-400' },
  { name: 'เทา', value: 'bg-gray-100 text-gray-800 border-gray-400' }
];

// คืนลิงก์แผนที่ของงาน: ใช้ลิงก์ที่ผู้ใช้ฝังไว้ก่อน ถ้าไม่มีให้ค้นจากชื่อสถานที่
const getMapUrl = (job) => {
  if (!job) return null;
  if (job.mapUrl && job.mapUrl.trim()) return job.mapUrl.trim();
  if (job.location && job.location.trim()) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(job.location.trim());
  }
  return null;
};

// แสดงชื่อสถานที่แบบกดแล้วเปิดแผนที่ได้ (ใช้ร่วมกันทุกหน้า)
function LocationLink({ job, size = 11, className = '' }) {
  if (!job || !job.location) return null;
  const url = getMapUrl(job);
  const content = (<><MapPin size={size} className="flex-shrink-0" /> <span className="truncate">{job.location}</span></>);
  if (!url) {
    return <span className={`inline-flex items-center gap-1 ${className}`}>{content}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={'เปิดแผนที่: ' + job.location}
      className={`inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline ${className}`}
    >
      {content}
    </a>
  );
}

const formatThaiDate = (dateStr) => {
  if (!dateStr) return '';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateStr).toLocaleDateString('th-TH', options);
};

// ฟังก์ชันดึงกิจกรรมในแต่ละวัน (รวมถึงเวลาที่ถูกตั้งค่า Override รายวันไว้)
const getPhasesOnDate = (job, dateStr) => {
  if (!job || !job.phases) return [];
  const basePhases = job.phases.filter(p => {
    const sDate = p.startDate || p.date;
    const eDate = p.endDate || p.date || sDate;
    return dateStr >= sDate && dateStr <= eDate;
  });

  return basePhases.map(p => {
    if (job.dailyOverrides && job.dailyOverrides[dateStr] && job.dailyOverrides[dateStr].phases && job.dailyOverrides[dateStr].phases[p.id]) {
       return { ...p, ...job.dailyOverrides[dateStr].phases[p.id] };
    }
    return p;
  });
};

// ฟังก์ชันดึงรายชื่อคนในแต่ละวัน (ถ้ามีการตั้งค่าคนรายวัน จะดึงข้อมูลรายวันแทน)
const getStaffOnDate = (job, dateStr) => {
  if (job.dailyOverrides && job.dailyOverrides[dateStr] && job.dailyOverrides[dateStr].staffIds) {
     return job.dailyOverrides[dateStr].staffIds;
  }
  return job.assignedStaffIds || [];
};

// ฟังก์ชันรวมข้อมูล Array 2 ชุด โดยใช้ id เป็นตัวเช็ค (ป้องกันข้อมูลซ้ำ)
const mergeData = (currentList, importedList) => {
        const map = new Map(currentList.map(item => [item.id, item]));
        importedList.forEach(item => map.set(item.id, item));
        return Array.from(map.values());
};


function CustomDialog({ dialog, setDialog }) {
  if (!dialog.isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center overflow-y-auto z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center">
         <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4 ${dialog.type === 'confirm' ? 'bg-yellow-100 text-yellow-600' : dialog.type === 'import' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
            {dialog.type === 'confirm' ? <CalendarIcon size={24} /> : dialog.type === 'import' ? <Upload size={24} /> : dialog.type === 'choice' ? <Users size={24} /> : <Users size={24} />}
         </div>
         <h3 className="text-lg font-bold text-gray-900 mb-2">
            {dialog.type === 'confirm' ? 'ยืนยันการทำรายการ'
              : dialog.type === 'import' ? 'นำเข้าข้อมูลไฟล์ Backup'
              : dialog.type === 'choice' ? (dialog.title || 'เลือกวิธีดำเนินการ')
              : 'แจ้งเตือน'}
         </h3>
         <p className="text-gray-600 text-sm mb-6 whitespace-pre-line text-left bg-gray-50 p-3 rounded-lg border">{dialog.message}</p>

         {dialog.type === 'choice' ? (
            <div className="flex flex-col gap-2">
               <button
                  onClick={() => { const a = dialog.onOptionA; setDialog({ isOpen: false, type: 'info', message: '', onConfirm: null }); if(a) setTimeout(a, 150); }}
                  className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold transition-colors w-full shadow-sm"
               >
                  {dialog.labelA || 'ตัวเลือก A'}
               </button>
               <button
                  onClick={() => { const a = dialog.onOptionB; setDialog({ isOpen: false, type: 'info', message: '', onConfirm: null }); if(a) setTimeout(a, 150); }}
                  className="px-5 py-2.5 bg-gray-700 text-white hover:bg-gray-800 rounded-lg text-sm font-bold transition-colors w-full shadow-sm"
               >
                  {dialog.labelB || 'ตัวเลือก B'}
               </button>
               <button onClick={() => setDialog({ isOpen: false, type: 'info', message: '', onConfirm: null })} className="px-5 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-bold transition-colors w-full">
                  ยกเลิก
               </button>
            </div>
         ) : dialog.type === 'import' ? (
            <div className="flex flex-col gap-2">
               <button
                  onClick={() => { const action = dialog.onMerge; setDialog({ isOpen: false, type: 'info', message: '', onConfirm: null }); if(action) setTimeout(action, 150); }}
                  className="px-5 py-2.5 bg-green-600 text-white hover:bg-green-700 rounded-lg text-sm font-bold transition-colors w-full shadow-sm"
               >
                  รวมข้อมูล (Merge)
               </button>
               <button
                  onClick={() => { const action = dialog.onConfirm; setDialog({ isOpen: false, type: 'info', message: '', onConfirm: null }); if(action) setTimeout(action, 150); }}
                  className="px-5 py-2.5 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-bold transition-colors w-full shadow-sm"
               >
                  เขียนทับทั้งหมด (Overwrite)
               </button>
               <button onClick={() => setDialog({ isOpen: false, type: 'info', message: '', onConfirm: null })} className="px-5 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-bold transition-colors w-full">
                  ยกเลิก
               </button>
            </div>
         ) : (
            <div className="flex justify-center gap-3">
              {dialog.type === 'confirm' && (
                <button onClick={() => setDialog({ ...dialog, isOpen: false })} className="px-5 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-bold transition-colors w-full">
                  ยกเลิก
                </button>
              )}
              <button
                onClick={() => { const action = dialog.onConfirm; setDialog({ isOpen: false, type: 'info', message: '', onConfirm: null }); if (action) setTimeout(action, 150); }}
                className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold transition-colors shadow-sm w-full"
              >
                {dialog.type === 'confirm' ? 'ตกลงยืนยัน' : 'ปิด'}
              </button>
           </div>
         )}
      </div>
    </div>
  );
}

function DailyEditModal({ dailyEditContext, setDailyEditContext, staffList, handleSaveJob, setEditingJob, setIsJobModalOpen }) {
  if (!dailyEditContext) return null;
  const { job, date } = dailyEditContext;

  const todayPhases = getPhasesOnDate(job, date);
  const todayStaffIds = getStaffOnDate(job, date);

  const [localPhases, setLocalPhases] = useState(todayPhases);
  const [localStaffIds, setLocalStaffIds] = useState(todayStaffIds);

  const handlePhaseTimeChange = (id, field, value) => {
      setLocalPhases(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const toggleStaff = (staffId) => {
      setLocalStaffIds(prev => prev.includes(staffId)
          ? prev.filter(id => id !== staffId)
          : [...prev, staffId]
      );
  };

  const handleSaveDaily = () => {
      const newOverrides = { ...(job.dailyOverrides || {}) };
      const phaseOverrides = {};
      localPhases.forEach(p => {
          phaseOverrides[p.id] = { startTime: p.startTime, endTime: p.endTime };
      });

      newOverrides[date] = {
          phases: phaseOverrides,
          staffIds: localStaffIds
      };

      const finalJob = { ...job, dailyOverrides: newOverrides };
      handleSaveJob(finalJob);
      setDailyEditContext(null);
  };

  return (
      <div className="fixed inset-0 bg-black/60 flex items-start justify-center overflow-y-auto z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6">
              <div className="flex justify-between items-start mb-4 border-b pb-3">
                  <div>
                      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          <Edit size={20} className="text-blue-600"/> ปรับแต่งงานเฉพาะรายวัน
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                          แก้ไข <span className="font-bold text-blue-700">{job.name}</span> ประจำวันที่ <span className="font-bold">{formatThaiDate(date)}</span>
                      </p>
                  </div>
                  <button onClick={() => setDailyEditContext(null)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                      <X size={20} />
                  </button>
              </div>

              <div className="space-y-6 overflow-y-auto pr-2" style={{maxHeight: '60vh'}}>
                  <div>
                      <label className="block text-sm font-bold text-gray-800 mb-2">เวลาทำกิจกรรมในวันนี้</label>
                      <div className="space-y-3">
                          {localPhases.map(p => (
                              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50 p-3 rounded-lg border">
                                  <div className="font-bold text-sm sm:w-32">{p.type}</div>
                                  <div className="flex-1 flex gap-2">
                                      <div className="flex-1">
                                          <label className="text-[10px] text-gray-500 block font-medium">เข้างาน</label>
                                          <input type="time" value={p.startTime} onChange={e => handlePhaseTimeChange(p.id, 'startTime', e.target.value)} className="w-full text-sm border rounded p-1.5 outline-none focus:border-blue-500"/>
                                      </div>
                                      <div className="flex-1">
                                          <label className="text-[10px] text-gray-500 block font-medium">เลิกงาน</label>
                                          <input type="time" value={p.endTime} onChange={e => handlePhaseTimeChange(p.id, 'endTime', e.target.value)} className="w-full text-sm border rounded p-1.5 outline-none focus:border-blue-500"/>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>

                  <div>
                      <div className="flex justify-between items-end mb-2">
                          <label className="block text-sm font-bold text-gray-800">รายชื่อผู้ปฏิบัติงานในวันนี้</label>
                          <span className="text-xs text-blue-600 font-bold bg-blue-100 px-2 py-1 rounded-full">เข้างาน {localStaffIds.length} คน</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg border">
                          {staffList.map(staff => (
                              <label key={staff.id} className={`flex items-start p-2 border rounded-lg cursor-pointer transition-colors ${localStaffIds.includes(staff.id) ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white hover:bg-gray-100'}`}>
                                  <input
                                      type="checkbox"
                                      checked={localStaffIds.includes(staff.id)}
                                      onChange={() => toggleStaff(staff.id)}
                                      className="mt-1 mr-2 rounded text-blue-600"
                                  />
                                  <div className="text-sm">
                                      <div className="font-medium text-gray-800 leading-tight">{staff.name}</div>
                                      <div className="text-[10px] text-gray-500">{staff.role} {staff.headcount > 1 ? `(จำนวน ${staff.headcount} คน)` : ''}</div>
                                  </div>
                              </label>
                          ))}
                      </div>
                  </div>
              </div>

              <div className="flex justify-between items-center mt-6 pt-4 border-t">
                  <button
                      onClick={() => {
                          setDailyEditContext(null);
                          setEditingJob(job);
                          setIsJobModalOpen(true);
                      }}
                      className="text-sm text-gray-500 hover:text-blue-600 font-medium underline underline-offset-2"
                  >
                      แก้ไขภาพรวมงานทั้งหมด
                  </button>
                  <div className="flex gap-2">
                      <button onClick={() => setDailyEditContext(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">ยกเลิก</button>
                      <button onClick={handleSaveDaily} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm">บันทึกของวันนี้</button>
                  </div>
              </div>
          </div>
      </div>
  );
}

function JobFormModal({ isJobModalOpen, setIsJobModalOpen, editingJob, setEditingJob, handleSaveJob, handleDeleteJob, staffList, setDialog, savedLocations = [] }) {
  if (!isJobModalOpen) return null;

  const [jobData, setJobData] = useState({
    name: editingJob?.name || '',
    client: editingJob?.client || '',
    location: editingJob?.location || '',
    mapUrl: editingJob?.mapUrl || '',
    status: editingJob?.status || JOB_STATUSES.PENDING,
    color: editingJob?.color || '',
    assignedStaffIds: editingJob?.assignedStaffIds || []
  });

  const initialPhases = {};
  PHASE_TYPES.forEach(type => {
    const existing = editingJob?.phases?.filter(p => p.type === type) || [];
    let schedules = [];
    if (existing.length > 0) {
        existing.forEach(ep => {
            schedules.push({
                id: ep.id,
                startDate: ep.startDate || ep.date || '',
                endDate: ep.endDate || ep.date || '',
                startTime: ep.startTime,
                endTime: ep.endTime
            });
        });
    } else {
        schedules = [{ startDate: '', endDate: '', startTime: '08:00', endTime: '18:00' }];
    }
    initialPhases[type] = {
      isActive: existing.length > 0,
      schedules: schedules
    };
  });

  const initialCustomPhases = editingJob?.phases
    ?.filter(p => !PHASE_TYPES.includes(p.type))
    ?.map(p => ({
      id: p.id,
      name: p.type,
      startDate: p.startDate || p.date || '',
      endDate: p.endDate || p.date || '',
      startTime: p.startTime || '08:00',
      endTime: p.endTime || '18:00'
    })) || [];

  const [phaseData, setPhaseData] = useState(initialPhases);
  const [customPhases, setCustomPhases] = useState(initialCustomPhases);

  const handlePhaseChange = (type, field, value) => {
    setPhaseData(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  };

  const handleScheduleChange = (type, index, field, value) => {
    setPhaseData(prev => {
      const newSchedules = [...prev[type].schedules];
      newSchedules[index] = { ...newSchedules[index], [field]: value };
      if (field === 'startDate' && (!newSchedules[index].endDate || newSchedules[index].endDate < value)) {
          newSchedules[index].endDate = value;
      }
      return { ...prev, [type]: { ...prev[type], schedules: newSchedules } };
    });
  };

  const addSchedule = (type) => {
    setPhaseData(prev => {
      const lastSch = prev[type].schedules[prev[type].schedules.length - 1];
      return {
        ...prev,
        [type]: {
          ...prev[type],
          schedules: [...prev[type].schedules, { startDate: lastSch?.startDate || '', endDate: lastSch?.endDate || '', startTime: '08:00', endTime: '18:00' }]
        }
      };
    });
  };

  const removeSchedule = (type, index) => {
    setPhaseData(prev => {
      const newSchedules = prev[type].schedules.filter((_, i) => i !== index);
      return { ...prev, [type]: { ...prev[type], schedules: newSchedules } };
    });
  };

  const addCustomPhase = () => {
    setCustomPhases(prev => [
      ...prev,
      { id: `custom-${Date.now()}`, name: '', startDate: '', endDate: '', startTime: '08:00', endTime: '18:00' }
    ]);
  };

  const updateCustomPhase = (index, field, value) => {
    setCustomPhases(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'startDate' && (!updated[index].endDate || updated[index].endDate < value)) {
        updated[index].endDate = value;
      }
      return updated;
    });
  };

  const removeCustomPhase = (index) => {
    setCustomPhases(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!jobData.name.trim()) {
      setDialog({ isOpen: true, type: 'info', message: 'กรุณากรอกชื่องาน ก่อนบันทึก' });
      return;
    }

    const activePhases = [];
    PHASE_TYPES.forEach(type => {
      if (phaseData[type].isActive) {
        phaseData[type].schedules.forEach((sch, i) => {
          if (sch.startDate && sch.endDate) {
            activePhases.push({
              id: sch.id || `p-${type}-${Date.now()}-${i}`,
              type: type,
              startDate: sch.startDate,
              endDate: sch.endDate,
              startTime: sch.startTime,
              endTime: sch.endTime
            });
          }
        });
      }
    });

    customPhases.forEach((cp, i) => {
      if (cp.name.trim() && cp.startDate && cp.endDate) {
        activePhases.push({
          id: cp.id || `p-custom-${Date.now()}-${i}`,
          type: cp.name.trim(),
          startDate: cp.startDate,
          endDate: cp.endDate,
          startTime: cp.startTime,
          endTime: cp.endTime
        });
      }
    });

    const finalJob = {
      id: editingJob ? editingJob.id : `j${Date.now()}`,
      ...jobData,
      phases: activePhases,
      dailyOverrides: editingJob?.dailyOverrides || {}
    };

    if (activePhases.length === 0) {
        setDialog({
           isOpen: true,
           type: 'confirm',
           message: 'คุณไม่ได้ระบุวันที่/กิจกรรมใดๆ เลย แน่ใจหรือไม่ว่าจะบันทึก?',
           onConfirm: () => {
              setEditingJob(finalJob);
              handleSaveJob(finalJob);
           }
        });
        return;
    }

    setEditingJob(finalJob);
    handleSaveJob(finalJob);
  };

  const toggleStaffAssignment = (staffId) => {
    setJobData(prev => {
      const isAssigned = prev.assignedStaffIds.includes(staffId);
      if (isAssigned) {
        return { ...prev, assignedStaffIds: prev.assignedStaffIds.filter(id => id !== staffId) };
      } else {
        return { ...prev, assignedStaffIds: [...prev.assignedStaffIds, staffId] };
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center overflow-y-auto z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8 flex flex-col" style={{maxHeight: 'calc(100vh - 4rem)'}}>
        <div className="flex justify-between items-center px-6 pt-6 pb-3 border-b flex-shrink-0">
          <h2 className="text-xl font-bold">{editingJob ? 'แก้ไขภาพรวมงาน' : 'เพิ่มงานใหม่'}</h2>
          <button onClick={() => setIsJobModalOpen(false)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0">
        <div className="space-y-4 overflow-y-auto px-6 py-4 flex-1 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">ชื่องาน *</label>
              <input type="text" required value={jobData.name} onChange={e => setJobData({...jobData, name: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">ชื่อลูกค้า</label>
              <input type="text" value={jobData.client} onChange={e => setJobData({...jobData, client: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">สถานะงาน</label>
              <select value={jobData.status} onChange={e => setJobData({...jobData, status: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 outline-none bg-white text-sm">
                {Object.values(JOB_STATUSES).map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">สีแสดงผลในปฏิทิน</label>
              <div className="flex gap-2 items-center flex-wrap px-1" style={{minHeight: 38}}>
                {JOB_COLORS.map(c => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setJobData({...jobData, color: c.value})}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${c.value ? c.value.split(' ')[0] : 'bg-gray-100'} ${jobData.color === c.value ? 'border-gray-800 ring-2 ring-gray-400 ring-offset-1 scale-110' : 'border-gray-200 hover:scale-105'}`}
                    title={c.name}
                  >
                    {!c.value && <span className="text-[10px] text-gray-500 flex items-center justify-center h-full">A</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="flex justify-between block text-[11px] font-bold text-gray-500 mb-1">
                <span>สถานที่ (ชื่อ)</span>
                {savedLocations.length > 0 && (
                  <span className="text-gray-400 font-normal">พิมพ์เพื่อค้นหา หรือกดเลือกจาก {savedLocations.length} ที่ที่เคยใช้</span>
                )}
              </label>
              <input
                type="text"
                list="savedLocationList"
                value={jobData.location}
                onChange={e => {
                  const val = e.target.value;
                  // ถ้าเลือกสถานที่ที่เคยบันทึกไว้ ให้เติมลิงก์แผนที่ให้อัตโนมัติ
                  const hit = savedLocations.find(l => l.location === val);
                  setJobData(prev => ({
                    ...prev,
                    location: val,
                    mapUrl: (hit && hit.mapUrl) ? hit.mapUrl : prev.mapUrl
                  }));
                }}
                placeholder="ระบุชื่อสถานที่จัดงาน"
                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <datalist id="savedLocationList">
                {savedLocations.map(l => <option key={l.location} value={l.location} />)}
              </datalist>
            </div>
            <div className="md:col-span-2">
              <label className="flex justify-between block text-[11px] font-bold text-gray-500 mb-1">
                <span>ลิงก์ Google Maps</span>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobData.location || 'สถานที่จัดงาน')}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 underline">🔍 ค้นหาใน Google Maps เพื่อก๊อปปี้ลิงก์</a>
              </label>
              <input type="text" value={jobData.mapUrl} onChange={e => setJobData({...jobData, mapUrl: e.target.value})} placeholder="วางลิงก์ Google Maps (เช่น https://maps.app.goo.gl/...)" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
            </div>
          </div>

          <div className="mt-6 pt-4 border-t">
            <div className="mb-3">
              <label className="block text-sm font-bold text-gray-800">ระบุช่วงวันและเวลาของแต่ละกิจกรรม (ภาพรวม)</label>
              <p className="text-xs text-gray-500 mt-1">ติ๊กเลือกกิจกรรมที่มีในงานนี้ (หากต้องการปรับเวลาเริ่ม/เลิกของแต่ละวัน ให้คลิกที่ชื่อกิจกรรมในหน้าปฏิทินหลังจากสร้างงานเสร็จ)</p>
            </div>
            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border">
              {PHASE_TYPES.map((type) => {
                const data = phaseData[type];
                return (
                  <div key={type} className={`flex flex-col items-start gap-2 p-3 rounded-lg border transition-all ${data.isActive ? 'bg-white border-blue-300 shadow-sm' : 'bg-gray-100 border-gray-200'}`}>
                    <div className="w-full flex items-center">
                      <label className="flex items-center cursor-pointer text-sm font-bold text-gray-800 w-full">
                        <input
                          type="checkbox"
                          checked={data.isActive}
                          onChange={(e) => handlePhaseChange(type, 'isActive', e.target.checked)}
                          className="mr-3 rounded text-blue-600 w-5 h-5"
                        />
                        {type}
                      </label>
                    </div>

                    {data.isActive && (
                      <div className="w-full mt-2 pl-8 space-y-2">
                        {data.schedules.map((sch, idx) => (
                          <div key={idx} className="flex flex-wrap lg:flex-nowrap w-full gap-2 items-center bg-gray-50/50 p-2 rounded border border-gray-100">
                             <div className="flex-1" style={{minWidth: 120}}>
                               <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">เริ่มวันที่</label>
                               <input
                                 type="date"
                                 value={sch.startDate}
                                 onChange={e => handleScheduleChange(type, idx, 'startDate', e.target.value)}
                                 className="w-full border border-gray-300 rounded p-1.5 text-sm outline-none"
                               />
                             </div>
                             <div className="flex-1" style={{minWidth: 120}}>
                               <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">ถึงวันที่</label>
                               <input
                                 type="date"
                                 value={sch.endDate}
                                 min={sch.startDate}
                                 onChange={e => handleScheduleChange(type, idx, 'endDate', e.target.value)}
                                 className="w-full border border-gray-300 rounded p-1.5 text-sm outline-none"
                               />
                             </div>
                             <div className="flex-1 lg:flex-none lg:w-24">
                               <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">เวลาเข้างาน</label>
                               <input
                                 type="time"
                                 value={sch.startTime}
                                 onChange={e => handleScheduleChange(type, idx, 'startTime', e.target.value)}
                                 className="w-full border border-gray-300 rounded p-1.5 text-sm outline-none"
                               />
                             </div>
                             <div className="flex-1 lg:flex-none lg:w-24">
                               <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">เวลาเลิกงาน</label>
                               <input
                                 type="time"
                                 value={sch.endTime}
                                 onChange={e => handleScheduleChange(type, idx, 'endTime', e.target.value)}
                                 className="w-full border border-gray-300 rounded p-1.5 text-sm outline-none"
                               />
                             </div>
                             {data.schedules.length > 1 && (
                               <button type="button" onClick={() => removeSchedule(type, idx)} className="self-end p-1.5 mb-0.5 text-red-500 hover:bg-red-50 rounded-lg">
                                 <Trash2 size={16} />
                               </button>
                             )}
                          </div>
                        ))}
                        <button type="button" onClick={() => addSchedule(type)} className="text-xs text-blue-600 font-bold hover:text-blue-800 flex items-center mt-2 px-1">
                          <Plus size={14} className="mr-1" /> เพิ่มช่วงวันสำหรับ {type}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
                  ✨ กิจกรรมอื่น ๆ (พิมพ์ชื่อเอง)
                </span>
                <button
                  type="button"
                  onClick={addCustomPhase}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg"
                >
                  <Plus size={14} className="mr-1" /> เพิ่มกิจกรรมอื่น ๆ
                </button>
              </div>

              {customPhases.length > 0 && (
                <div className="space-y-3 bg-gray-50 p-3 rounded-xl border border-dashed border-gray-300">
                  {customPhases.map((cp, idx) => (
                    <div key={cp.id || idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="ระบุชื่อกิจกรรม (เช่น ถ่ายพรีเซนเทชั่น, สรุปงาน)"
                          value={cp.name}
                          onChange={e => updateCustomPhase(idx, 'name', e.target.value)}
                          className="flex-1 border border-gray-300 rounded p-1.5 text-sm outline-none font-bold text-gray-800 focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => removeCustomPhase(idx)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          title="ลบกิจกรรมนี้"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="flex flex-wrap lg:flex-nowrap w-full gap-2 items-center">
                        <div className="flex-1" style={{minWidth: 120}}>
                          <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">เริ่มวันที่</label>
                          <input
                            type="date"
                            value={cp.startDate}
                            onChange={e => updateCustomPhase(idx, 'startDate', e.target.value)}
                            className="w-full border border-gray-300 rounded p-1.5 text-sm outline-none"
                          />
                        </div>
                        <div className="flex-1" style={{minWidth: 120}}>
                          <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">ถึงวันที่</label>
                          <input
                            type="date"
                            value={cp.endDate}
                            min={cp.startDate}
                            onChange={e => updateCustomPhase(idx, 'endDate', e.target.value)}
                            className="w-full border border-gray-300 rounded p-1.5 text-sm outline-none"
                          />
                        </div>
                        <div className="flex-1 lg:flex-none lg:w-24">
                          <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">เวลาเข้างาน</label>
                          <input
                            type="time"
                            value={cp.startTime}
                            onChange={e => updateCustomPhase(idx, 'startTime', e.target.value)}
                            className="w-full border border-gray-300 rounded p-1.5 text-sm outline-none"
                          />
                        </div>
                        <div className="flex-1 lg:flex-none lg:w-24">
                          <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">เวลาเลิกงาน</label>
                          <input
                            type="time"
                            value={cp.endTime}
                            onChange={e => updateCustomPhase(idx, 'endTime', e.target.value)}
                            className="w-full border border-gray-300 rounded p-1.5 text-sm outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t">
            <label className="block text-sm font-bold mb-2 text-gray-800">จัดสรรทีมงานหลัก ({jobData.assignedStaffIds.length} ราย/ทีม)</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 border rounded-xl bg-gray-50">
              {staffList.map(staff => (
                <label key={staff.id} className={`flex items-start p-2 border rounded-lg cursor-pointer transition-all ${jobData.assignedStaffIds.includes(staff.id) ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:bg-gray-100'}`}>
                  <input
                    type="checkbox"
                    className="mt-1 mr-2 rounded text-blue-600"
                    checked={jobData.assignedStaffIds.includes(staff.id)}
                    onChange={() => toggleStaffAssignment(staff.id)}
                  />
                  <div className="text-sm">
                    <div className="font-medium text-gray-800 leading-tight">{staff.name}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{staff.role} {staff.headcount > 1 ? `(จำนวน ${staff.headcount} คน)` : ''}</div>
                  </div>
                </label>
              ))}
              {staffList.length === 0 && (
                <div className="col-span-full text-center text-gray-400 text-sm py-4">ยังไม่มีข้อมูลพนักงาน กรุณาไปที่เมนู 'จัดการพนักงาน' ก่อน</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-t flex-shrink-0">
          {editingJob ? (
            <button type="button" onClick={() => handleDeleteJob(editingJob.id)} className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium flex items-center">
              <Trash2 size={16} className="mr-2" /> ลบงาน
            </button>
          ) : <div></div>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setIsJobModalOpen(false)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">
              ยกเลิก
            </button>
            <button type="button" onClick={handleSubmit} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm">
              บันทึกงาน
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [jobList, setJobList] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [connError, setConnError] = useState('');
  const [ganttSort, setGanttSort] = useState('role');
  const [isSaving, setIsSaving] = useState(false);

  const [activeTab, setActiveTab] = useState('calendar');
  const [currentUserRole, setCurrentUserRole] = useState('staff');

  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);

  const [dailyEditContext, setDailyEditContext] = useState(null);

  const [isStaffManagementModalOpen, setIsStaffManagementModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: '', role: ROLES[0], customRole: '', phone: '', headcount: 1 });
  const [editingStaffId, setEditingStaffId] = useState(null);

  const [isLineSummaryOpen, setIsLineSummaryOpen] = useState(false);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [dashboardMonth, setDashboardMonth] = useState(new Date());

  const [dialog, setDialog] = useState({ isOpen: false, type: 'info', message: '', onConfirm: null, onMerge: null });

  const fileInputRef = useRef(null);

  // ตรวจจับขนาดหน้าจอ เพื่อสลับปฏิทินเป็นแบบรายการเมื่อใช้บนมือถือ
  useEffect(() => {
    const checkSize = () => setIsMobile(window.innerWidth < 768);
    checkSize();
    window.addEventListener('resize', checkSize);
    window.addEventListener('orientationchange', checkSize);
    return () => {
      window.removeEventListener('resize', checkSize);
      window.removeEventListener('orientationchange', checkSize);
    };
  }, []);

  // ===== โหลดข้อมูลจาก Supabase + รับการเปลี่ยนแปลงแบบ realtime =====
  const loadAll = async () => {
    if (!supabase) { setIsDataLoaded(true); return; }
    try {
      const [jobsRes, staffRes] = await Promise.all([
        supabase.from('jobs').select('*'),
        supabase.from('staff').select('*'),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (staffRes.error) throw staffRes.error;

      setJobList((jobsRes.data || []).map(rowToJob));
      setStaffList((staffRes.data || []).map(rowToStaff));
      setLastSyncedAt(new Date());
      setConnError('');
    } catch (e) {
      console.error('โหลดข้อมูลผิดพลาด', e);
      setConnError(e.message || 'เชื่อมต่อฐานข้อมูลไม่ได้');
    }
    setIsDataLoaded(true);
  };

  useEffect(() => {
    if (!supabase) { setIsDataLoaded(true); return; }
    loadAll();

    // ฟังการเปลี่ยนแปลงจากคนอื่นแบบทันที (realtime)
    const channel = supabase
      .channel('schedule-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, () => loadAll())
      .subscribe();

    // เผื่อ realtime หลุด: พอสลับกลับมาที่หน้านี้ให้ดึงข้อมูลใหม่
    const handleVisibility = () => { if (document.visibilityState === 'visible') loadAll(); };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // ยังตั้งค่ากุญแจเชื่อมต่อไม่ครบ — แสดงวิธีแก้แทนหน้าขาว
  if (configError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 overflow-y-auto">
        <div className="bg-white border border-amber-300 rounded-xl p-6 max-w-2xl w-full my-8 shadow-sm">
          <div className="text-4xl mb-3 text-center">🔧</div>
          <h2 className="font-bold text-xl text-gray-900 mb-2 text-center">ยังตั้งค่าไม่เสร็จ</h2>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 mb-5 text-center font-bold">
            {configError}
          </div>

          <p className="text-sm text-gray-700 mb-3 font-bold">วิธีแก้ (เลือกตามวิธีที่ใช้ deploy):</p>

          <div className="mb-5">
            <div className="font-bold text-sm text-gray-800 mb-2">📦 ถ้าลากโฟลเดอร์ dist ขึ้น Netlify เอง</div>
            <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside pl-1">
              <li>กลับไปที่โฟลเดอร์ <code className="bg-gray-100 px-1 rounded">scheduler</code> ในเครื่อง</li>
              <li>ตรวจว่ามีไฟล์ชื่อ <code className="bg-gray-100 px-1 rounded">.env</code> (ไม่ใช่ <code className="bg-gray-100 px-1 rounded">.env.txt</code>)</li>
              <li>ข้างในต้องมี 2 บรรทัดนี้ ไม่มีเว้นวรรครอบเครื่องหมาย =</li>
            </ol>
            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg mt-2 overflow-x-auto">VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxx...</pre>
            <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside pl-1 mt-2" start={4}>
              <li>พิมพ์ <code className="bg-gray-100 px-1 rounded">npm run build</code> ใหม่อีกครั้ง</li>
              <li>ลากโฟลเดอร์ <code className="bg-gray-100 px-1 rounded">dist</code> ขึ้น Netlify ใหม่</li>
            </ol>
          </div>

          <div className="mb-5">
            <div className="font-bold text-sm text-gray-800 mb-2">🔗 ถ้าเชื่อมผ่าน GitHub</div>
            <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside pl-1">
              <li>เข้า Netlify → <b>Site configuration</b> → <b>Environment variables</b></li>
              <li>กด <b>Add a variable</b> ใส่ทั้ง 2 ค่าข้างบน</li>
              <li>ไปที่แท็บ <b>Deploys</b> → <b>Trigger deploy</b> → <b>Clear cache and deploy site</b></li>
            </ol>
            <p className="text-xs text-gray-500 mt-2">
              ⚠️ ใส่ค่าแล้วต้อง deploy ใหม่เสมอ ค่าจะไม่มีผลกับเว็บที่ build ไปแล้ว
            </p>
          </div>

          <p className="text-xs text-gray-500 border-t pt-3">
            <b>Project URL</b> อยู่ที่ Supabase → Project Settings → <b>Data API</b><br/>
            <b>Publishable key</b> (ขึ้นต้นด้วย sb_publishable_) อยู่ที่ Project Settings → <b>API Keys</b><br/>
            ⛔ ห้ามใช้ Secret key (sb_secret_) หรือ service_role เด็ดขาด
          </p>
        </div>
      </div>
    );
  }

  if (!isDataLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">กำลังโหลดตารางงาน...</div>
      </div>
    );
  }

  if (connError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-xl p-6 max-w-md text-center shadow-sm">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="font-bold text-lg text-gray-900 mb-2">เชื่อมต่อฐานข้อมูลไม่ได้</h2>
          <p className="text-sm text-gray-600 mb-4">{connError}</p>
          <p className="text-xs text-gray-500 mb-4">
            ตรวจสอบว่าตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ถูกต้องแล้ว
            และรันสคริปต์ supabase-setup.sql ใน Supabase เรียบร้อย
          </p>
          <button onClick={() => { setConnError(''); setIsDataLoaded(false); loadAll(); }}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">
            ลองใหม่อีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  const handleRoleSelect = (e) => {
    setCurrentUserRole(e.target.value);
  };

  const handleExportData = () => {
    const dataToSave = { jobList, staffList, exportDate: new Date().toISOString() };
    const json = JSON.stringify(dataToSave, null, 2);
    // ชื่อไฟล์: schedule backup YYYY-MM-DD (ชื่อไฟล์ใช้ / ไม่ได้ จึงใช้ - แทน เรียงตามวันที่ได้เหมือนกัน)
    const n = new Date();
    const stamp = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const filename = `schedule backup ${stamp}.json`;

    // วิธีที่ 1: ดาวน์โหลดเป็นไฟล์ผ่าน Blob (เสถียรกว่า data: URL)
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      setDialog({
        isOpen: true,
        type: 'info',
        message: `กำลังดาวน์โหลดไฟล์สำรองข้อมูล (${filename})\n\nถ้าไม่พบไฟล์ในเครื่อง แสดงว่าระบบบล็อกการดาวน์โหลดไว้ ให้กดปุ่ม "สำรองข้อมูล" ค้างไว้แล้วเลือก "คัดลอกข้อมูล" แทน`
      });
    } catch (e) {
      // วิธีที่ 2: ถ้าดาวน์โหลดไม่ได้ ให้คัดลอกไปคลิปบอร์ดแทน
      handleCopyBackup();
    }
  };

  const handleCopyBackup = async () => {
    const dataToSave = { jobList, staffList, exportDate: new Date().toISOString() };
    const json = JSON.stringify(dataToSave, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setDialog({
        isOpen: true,
        type: 'info',
        message: 'คัดลอกข้อมูลสำรองลงคลิปบอร์ดแล้ว\n\nนำไปวางในไฟล์ Notepad แล้วบันทึกเป็นนามสกุล .json เก็บไว้ได้เลย'
      });
    } catch (e) {
      setDialog({ isOpen: true, type: 'info', message: 'คัดลอกไม่สำเร็จ: ' + e.message });
    }
  };

  const handlePasteRestore = () => {
    const text = window.prompt('วางข้อมูลสำรอง (JSON) ที่คัดลอกไว้ ลงในช่องนี้:');
    if (!text) return;
    try {
      const content = JSON.parse(text);
      if (!content.jobList || !content.staffList) {
        setDialog({ isOpen: true, type: 'info', message: 'ข้อมูลไม่ถูกต้อง ไม่ใช่ไฟล์สำรองของระบบนี้' });
        return;
      }
      setDialog({
        isOpen: true,
        type: 'import',
        message: 'คุณต้องการนำเข้าข้อมูลแบบใด?\n\n- "รวมข้อมูล" : นำงาน/ทีมงานจากไฟล์มาต่อท้ายข้อมูลที่มีอยู่\n- "เขียนทับ" : ลบข้อมูลปัจจุบันทั้งหมดและแทนที่ด้วยไฟล์',
        onMerge: () => {
          bulkWrite(mergeData(jobList, content.jobList), mergeData(staffList, content.staffList), false);
        },
        onConfirm: () => {
          bulkWrite(content.jobList, content.staffList, true);
        }
      });
    } catch (e) {
      setDialog({ isOpen: true, type: 'info', message: 'อ่านข้อมูลไม่ได้ ตรวจสอบว่าวางข้อมูลครบถ้วนหรือไม่' });
    }
  };

  const handleImportData = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = e => {
      try {
        const content = JSON.parse(e.target.result);
        if (content.jobList && content.staffList) {
          setDialog({
            isOpen: true,
            type: 'import',
            message: 'คุณต้องการนำเข้าข้อมูลแบบใด?\n\n- "รวมข้อมูล" : นำงาน/ทีมงานจากไฟล์มาต่อท้ายข้อมูลที่มีอยู่\n- "เขียนทับ" : ลบข้อมูลปัจจุบันทั้งหมดและแทนที่ด้วยไฟล์',
            onMerge: () => {
              bulkWrite(mergeData(jobList, content.jobList), mergeData(staffList, content.staffList), false);
            },
            onConfirm: () => {
              bulkWrite(content.jobList, content.staffList, true);
            }
          });
        } else {
          setDialog({ isOpen: true, type: 'info', message: 'ไฟล์ข้อมูลไม่ถูกต้อง หรือไม่ใช่ไฟล์ Backup ของระบบนี้' });
        }
      } catch (error) {
          setDialog({ isOpen: true, type: 'info', message: 'เกิดข้อผิดพลาดในการอ่านไฟล์ กรุณาลองใหม่อีกครั้ง' });
      }
    };
    event.target.value = null;
  };

  // เขียนข้อมูลชุดใหญ่ลงฐานข้อมูล (ใช้ตอนกู้คืน/รวมข้อมูล)
  const bulkWrite = async (jobs, staff, replaceAll) => {
    try {
      setIsSaving(true);
      if (replaceAll) {
        await supabase.from('jobs').delete().neq('id', '__none__');
        await supabase.from('staff').delete().neq('id', '__none__');
      }
      if (staff.length) {
        const { error } = await supabase.from('staff').upsert(staff.map(staffToRow));
        if (error) throw error;
      }
      if (jobs.length) {
        const { error } = await supabase.from('jobs').upsert(jobs.map(jobToRow));
        if (error) throw error;
      }
      await loadAll();
      setTimeout(() => setDialog({ isOpen: true, type: 'info', message: 'นำเข้าข้อมูลสำเร็จแล้ว!' }), 300);
    } catch (e) {
      setDialog({ isOpen: true, type: 'info', message: 'นำเข้าไม่สำเร็จ: ' + e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStaff = (id) => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      message: 'ลบพนักงาน/ทีมงานนี้ออกจากระบบ? (รายชื่อนี้จะถูกดึงออกจากทุกงานที่ถูกจัดคิวไว้)',
      onConfirm: async () => {
        try {
          setIsSaving(true);
          // ถอดชื่อคนนี้ออกจากทุกงานก่อน
          const affected = jobList.filter(job =>
            (job.assignedStaffIds || []).includes(id) ||
            Object.values(job.dailyOverrides || {}).some(o => (o.staffIds || []).includes(id))
          );
          for (const job of affected) {
            const newJob = { ...job };
            newJob.assignedStaffIds = (newJob.assignedStaffIds || []).filter(sid => sid !== id);
            const ov = { ...(newJob.dailyOverrides || {}) };
            Object.keys(ov).forEach(date => {
              if (ov[date].staffIds) {
                ov[date] = { ...ov[date], staffIds: ov[date].staffIds.filter(sid => sid !== id) };
              }
            });
            newJob.dailyOverrides = ov;
            const { error } = await supabase.from('jobs').upsert(jobToRow(newJob));
            if (error) throw error;
          }
          const { error } = await supabase.from('staff').delete().eq('id', id);
          if (error) throw error;
          await loadAll();
        } catch (e) {
          setDialog({ isOpen: true, type: 'info', message: 'ลบไม่สำเร็จ: ' + e.message });
        } finally {
          setIsSaving(false);
        }
      }
    });
  };

  const handleEditStaffClick = (staff) => {
    // ถ้าตำแหน่งที่บันทึกไว้ไม่อยู่ในรายการมาตรฐาน แปลว่าเป็นตำแหน่งที่พิมพ์เอง
    const isCustom = !ROLES.includes(staff.role);
    setStaffForm({
      name: staff.name,
      role: isCustom ? CUSTOM_ROLE : staff.role,
      customRole: isCustom ? staff.role : '',
      phone: staff.phone || '',
      headcount: staff.headcount || 1
    });
    setEditingStaffId(staff.id);
  };

  const handleSaveStaff = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!staffForm.name.trim()) {
      setDialog({ isOpen: true, type: 'info', message: 'กรุณากรอกชื่อ/บริษัท ก่อนบันทึก' });
      return;
    }
    // ถ้าเลือก "อื่นๆ" ต้องพิมพ์ชื่อตำแหน่งด้วย
    let finalRole = staffForm.role;
    if (finalRole === CUSTOM_ROLE) {
      if (!(staffForm.customRole || '').trim()) {
        setDialog({ isOpen: true, type: 'info', message: 'กรุณาพิมพ์ชื่อตำแหน่ง ในช่องใต้ตัวเลือก "อื่นๆ (ระบุเอง)"' });
        return;
      }
      finalRole = staffForm.customRole.trim();
    }
    const finalHeadcount = finalRole === 'Outsource Team' ? parseInt(staffForm.headcount || '1', 10) : 1;
    const record = {
      id: editingStaffId || `s${Date.now()}`,
      name: staffForm.name,
      role: finalRole,
      phone: staffForm.phone || '',
      headcount: finalHeadcount
    };
    try {
      setIsSaving(true);
      const { error } = await supabase.from('staff').upsert(staffToRow(record));
      if (error) throw error;
      await loadAll();
      setEditingStaffId(null);
      setStaffForm({ name: '', role: ROLES[0], customRole: '', phone: '', headcount: 1 });
    } catch (err) {
      setDialog({ isOpen: true, type: 'info', message: 'บันทึกไม่สำเร็จ: ' + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // เขียนงานลงฐานข้อมูลจริง (แยกออกมาเพื่อให้เรียกซ้ำได้หลังผู้ใช้เลือกวิธี)
  const writeJob = async (jobData) => {
    try {
      setIsSaving(true);
      const { error } = await supabase.from('jobs').upsert(jobToRow(jobData));
      if (error) throw error;
      await loadAll();
      setIsJobModalOpen(false);
      setEditingJob(null);
    } catch (e) {
      setDialog({ isOpen: true, type: 'info', message: 'บันทึกไม่สำเร็จ: ' + e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveJob = async (jobData) => {
    // ---- ตรวจว่ามีคนถูกเพิ่มเข้าทีมงานของโปรเจกต์ใหม่หรือไม่ ----
    // ถ้ามี และงานนี้เคยถูกปรับแต่งรายวันไว้ ต้องถามก่อนว่าจะให้คนใหม่เข้าวันไหนบ้าง
    // (ไม่งั้นวันที่เคยแก้ไว้จะไม่มีคนใหม่ ทำให้ปฏิทินดูเหมือนไม่อัปเดต)
    const oldIds = (editingJob && editingJob.assignedStaffIds) || [];
    const newIds = jobData.assignedStaffIds || [];
    const addedIds = newIds.filter(id => !oldIds.includes(id));
    const overrideDates = Object.keys(jobData.dailyOverrides || {});

    if (addedIds.length > 0 && overrideDates.length > 0) {
      const names = addedIds.map(id => {
        const s = staffList.find(x => x.id === id);
        return s ? s.name : 'ไม่ทราบชื่อ';
      }).join(', ');

      setDialog({
        isOpen: true,
        type: 'choice',
        title: 'เพิ่มคนใหม่เข้าวันไหนบ้าง?',
        message:
          'คุณเพิ่ม ' + names + ' เข้าทีมงานของงานนี้\n\n' +
          'งานนี้มี ' + overrideDates.length + ' วันที่เคยปรับแต่งรายชื่อคนแยกไว้แล้ว\n' +
          'ต้องการให้คนที่เพิ่มใหม่เข้าวันไหนบ้าง?',
        labelA: 'เพิ่มให้ทุกวัน (รวมวันที่เคยแก้ไว้)',
        labelB: 'เฉพาะวันที่ยังไม่เคยแก้',
        onOptionA: () => {
          // เติมคนใหม่เข้าไปในทุกวันที่เคยปรับแต่งไว้ด้วย
          const merged = { ...(jobData.dailyOverrides || {}) };
          overrideDates.forEach(d => {
            const cur = merged[d].staffIds || [];
            merged[d] = { ...merged[d], staffIds: Array.from(new Set([...cur, ...addedIds])) };
          });
          writeJob({ ...jobData, dailyOverrides: merged });
        },
        onOptionB: () => writeJob(jobData),
      });
      return;
    }

    try {
      setIsSaving(true);
      const { error } = await supabase.from('jobs').upsert(jobToRow(jobData));
      if (error) throw error;
      await loadAll();
      setIsJobModalOpen(false);
      setEditingJob(null);
    } catch (e) {
      setDialog({ isOpen: true, type: 'info', message: 'บันทึกไม่สำเร็จ: ' + e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteJob = (id) => {
    setDialog({
       isOpen: true,
       type: 'confirm',
       message: 'คุณต้องการลบงานนี้ออกจากระบบอย่างถาวรใช่หรือไม่?',
       onConfirm: async () => {
         try {
           setIsSaving(true);
           const { error } = await supabase.from('jobs').delete().eq('id', id);
           if (error) throw error;
           await loadAll();
           setIsJobModalOpen(false);
           setEditingJob(null);
         } catch (e) {
           setDialog({ isOpen: true, type: 'info', message: 'ลบไม่สำเร็จ: ' + e.message });
         } finally {
           setIsSaving(false);
         }
       }
    });
  };

  const generateLineSummary = () => {
    const today = currentDate;
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let summary = `📋 ตารางงานประจำวันที่ ${formatThaiDate(todayStr)}\n\n`;

    const todayJobs = jobList.filter(job => getPhasesOnDate(job, todayStr).length > 0);

    if (todayJobs.length === 0) {
      return summary + 'ไม่มีงานในวันนี้';
    }

    todayJobs.forEach(job => {
      summary += `📌 Job: ${job.name}\n`;
      summary += `📍 Location: ${job.location || 'ไม่ระบุ'}\n`;
      if (job.mapUrl) {
          summary += `🗺️ Map: ${job.mapUrl}\n`;
      } else if (job.location) {
          summary += `🗺️ Map: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location)}\n`;
      }
      summary += `⏰ Plan:\n`;

      const phasesToday = getPhasesOnDate(job, todayStr);
      phasesToday.sort((a, b) => a.startTime.localeCompare(b.startTime));

      phasesToday.forEach(p => {
        summary += `   - [${p.type}] ${p.startTime}-${p.endTime}\n`;
      });

      const dailyStaffIds = getStaffOnDate(job, todayStr);
      const assigned = dailyStaffIds.map(id => {
        const staff = staffList.find(s => s.id === id);
        return staff ? (staff.role === 'Outsource Team' && staff.headcount > 1 ? `${staff.name} (${staff.headcount} คน)` : `${staff.name}`) : 'ไม่ทราบชื่อ';
      });

      summary += `👥 Team: ${assigned.length > 0 ? assigned.join(', ') : 'ยังไม่จัดคน'}\n`;
      summary += `----------------------\n`;
    });

    return summary;
  };

  // รวบรวมสถานที่ที่เคยกรอกไว้ เพื่อให้เลือกซ้ำได้ไม่ต้องพิมพ์ใหม่
  // ถ้าสถานที่เดียวกันเคยใส่ลิงก์แผนที่ไว้ จะจำลิงก์ล่าสุดที่ไม่ว่างไว้ให้ด้วย
  const savedLocations = (() => {
    const map = new Map();
    jobList.forEach(job => {
      const loc = (job.location || '').trim();
      if (!loc) return;
      const prev = map.get(loc);
      map.set(loc, { location: loc, mapUrl: (job.mapUrl || '').trim() || (prev ? prev.mapUrl : '') });
    });
    return Array.from(map.values()).sort((a, b) => a.location.localeCompare(b.location, 'th'));
  })();

  const renderDashboard = () => {
    const allJobsSorted = [...jobList].sort((a, b) => {
      const aDates = a.phases?.map(p => new Date(p.startDate || p.date)).sort() || [];
      const bDates = b.phases?.map(p => new Date(p.startDate || p.date)).sort() || [];
      return (aDates[0] || new Date('2999-01-01')) - (bDates[0] || new Date('2999-01-01'));
    });

    const activeJobsCount = jobList.filter(j => j.status !== JOB_STATUSES.CANCELLED).length;
    const pendingJobsCount = jobList.filter(j => j.status === JOB_STATUSES.PENDING).length;

    const dYear = dashboardMonth.getFullYear();
    const dMonth = dashboardMonth.getMonth();

    const monthlyJobs = jobList.filter(job => {
      if (!job.phases || job.phases.length === 0) return false;
      return job.phases.some(p => {
        const date = new Date(p.startDate || p.date);
        return date.getFullYear() === dYear && date.getMonth() === dMonth;
      });
    }).sort((a, b) => {
      const aDates = a.phases.map(p => new Date(p.startDate || p.date)).sort();
      const bDates = b.phases.map(p => new Date(p.startDate || p.date)).sort();
      return (aDates[0] || new Date('2999-01-01')) - (bDates[0] || new Date('2999-01-01'));
    });

    return (
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-800">หน้าสรุปงาน (Dashboard)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
           <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center justify-between">
              <div>
                 <div className="text-blue-600 text-sm font-bold mb-1">งานที่ดำเนินการอยู่ (ทั้งหมด)</div>
                 <div className="text-3xl font-black text-blue-900">{activeJobsCount} <span className="text-sm font-normal text-blue-700">งาน</span></div>
              </div>
              <LayoutDashboard size={40} className="text-blue-200" />
           </div>
           <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl flex items-center justify-between">
              <div>
                 <div className="text-yellow-700 text-sm font-bold mb-1">งานที่รอยืนยัน (ทั้งหมด)</div>
                 <div className="text-3xl font-black text-yellow-900">{pendingJobsCount} <span className="text-sm font-normal text-yellow-700">งาน</span></div>
              </div>
              <CalendarIcon size={40} className="text-yellow-200" />
           </div>
           <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl flex items-center justify-between">
              <div>
                 <div className="text-purple-600 text-sm font-bold mb-1">ทีมงาน/ซัพพลายเออร์</div>
                 <div className="text-3xl font-black text-purple-900">{staffList.length} <span className="text-sm font-normal text-purple-700">ราย</span></div>
              </div>
              <Users size={40} className="text-purple-200" />
           </div>
        </div>

        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-start gap-3 sm:gap-4 mb-4 border-b pb-3">
            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
              <CalendarIcon size={20} className="text-blue-600"/> ตารางงานประจำเดือน
            </h3>
            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border shadow-sm">
              <button onClick={() => setDashboardMonth(new Date(dYear, dMonth - 1))} className="p-1.5 hover:bg-white rounded shadow-sm border border-transparent hover:border-gray-200 transition-all text-gray-600 hover:text-gray-900"><ChevronLeft size={18} /></button>
              <span className="font-bold text-gray-800 text-center text-sm" style={{minWidth: 130}}>
                {dashboardMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => setDashboardMonth(new Date(dYear, dMonth + 1))} className="p-1.5 hover:bg-white rounded shadow-sm border border-transparent hover:border-gray-200 transition-all text-gray-600 hover:text-gray-900"><ChevronRight size={18} /></button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-blue-50 text-blue-800 uppercase font-bold text-[11px]">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">เริ่มวันแรก</th>
                  <th className="px-4 py-3">ชื่องาน</th>
                  <th className="px-4 py-3">สถานที่</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {monthlyJobs.length === 0 ? (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500 bg-gray-50/50">ไม่มีงานในเดือนที่เลือก</td></tr>
                ) : (
                  monthlyJobs.map((job) => {
                    const sortedPhases = [...(job.phases || [])].sort((a, b) => new Date(a.startDate || a.date) - new Date(b.startDate || b.date));
                    const firstDate = sortedPhases.length > 0 ? formatThaiDate(sortedPhases[0].startDate || sortedPhases[0].date) : '-';
                    const mapUrl = getMapUrl(job);

                    return (
                      <tr key={job.id} className="bg-white border-b hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => { if(currentUserRole==='admin') { setEditingJob(job); setIsJobModalOpen(true); } }}>
                        <td className="px-4 py-3 font-medium text-blue-600 whitespace-nowrap">{firstDate}</td>
                        <td className="px-4 py-3 font-bold text-gray-900">{job.name}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {mapUrl ? (
                              <a href={mapUrl} target="_blank" rel="noopener noreferrer" title={'เปิดแผนที่: ' + (job.location || '')} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline" onClick={e => e.stopPropagation()}>
                                  <MapPin size={14} /> {job.location || 'ดูแผนที่'}
                              </a>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${job.color || STATUS_COLORS[job.status]}`}>{job.status}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-lg mb-3 text-gray-800 border-b pb-2 flex items-center gap-2">
            <LayoutDashboard size={20} className="text-gray-500"/> งานทั้งหมดในระบบ
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-[11px]">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">เริ่มวันแรก</th>
                  <th className="px-4 py-3">ชื่องาน</th>
                  <th className="px-4 py-3">สถานที่</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {allJobsSorted.length === 0 ? (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500 bg-gray-50/50">ไม่มีงานในระบบ</td></tr>
                ) : (
                  allJobsSorted.map((job) => {
                    const sortedPhases = [...(job.phases || [])].sort((a, b) => new Date(a.startDate || a.date) - new Date(b.startDate || b.date));
                    const firstDate = sortedPhases.length > 0 ? formatThaiDate(sortedPhases[0].startDate || sortedPhases[0].date) : '-';
                    const mapUrl = getMapUrl(job);

                    return (
                      <tr key={job.id} className="bg-white border-b hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => { if(currentUserRole==='admin') { setEditingJob(job); setIsJobModalOpen(true); } }}>
                        <td className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{firstDate}</td>
                        <td className="px-4 py-3 font-bold text-gray-900">{job.name}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {mapUrl ? (
                              <a href={mapUrl} target="_blank" rel="noopener noreferrer" title={'เปิดแผนที่: ' + (job.location || '')} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline" onClick={e => e.stopPropagation()}>
                                  <MapPin size={14} /> {job.location || 'ดูแผนที่'}
                              </a>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${job.color || STATUS_COLORS[job.status]}`}>{job.status}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

    const THAI_DAY_COLORS = [
       'bg-red-100 text-red-800 border-red-200',
       'bg-yellow-100 text-yellow-800 border-yellow-200',
       'bg-pink-100 text-pink-800 border-pink-200',
       'bg-green-100 text-green-800 border-green-200',
       'bg-orange-100 text-orange-800 border-orange-200',
       'bg-blue-100 text-blue-800 border-blue-200',
       'bg-purple-100 text-purple-800 border-purple-200'
    ];

    const THAI_DAY_CELL_BGS = [
       'bg-red-50/40',
       'bg-yellow-50/40',
       'bg-pink-50/40',
       'bg-green-50/40',
       'bg-orange-50/40',
       'bg-blue-50/40',
       'bg-purple-50/40'
    ];

    const monthlyCalendarJobs = jobList.filter(job => {
      if (!job.phases || job.phases.length === 0) return false;
      return job.phases.some(p => {
        const date = new Date(p.startDate || p.date);
        return date.getFullYear() === year && date.getMonth() === month;
      });
    }).sort((a, b) => {
      const aDates = a.phases.map(p => new Date(p.startDate || p.date)).sort();
      const bDates = b.phases.map(p => new Date(p.startDate || p.date)).sort();
      return (aDates[0] || new Date('2999-01-01')) - (bDates[0] || new Date('2999-01-01'));
    });

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border shadow-sm">
                <button
                  onClick={() => setCurrentDate(new Date(year, month - 1))}
                  className="p-1.5 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-gray-200 transition-all text-gray-600 hover:text-gray-900"
                  title="เดือนก่อนหน้า"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="font-bold text-gray-800 text-lg sm:text-xl px-2 text-center select-none" style={{minWidth: 150}}>
                  {currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setCurrentDate(new Date(year, month + 1))}
                  className="p-1.5 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-gray-200 transition-all text-gray-600 hover:text-gray-900"
                  title="เดือนถัดไป"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>

          {isMobile ? (
            /* ===== มุมมองมือถือ: แสดงเป็นรายการวัน อ่านง่ายกว่าตารางบีบ 7 ช่อง ===== */
            <div className="space-y-2">
              {days.filter(day => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                return jobList.some(job => getPhasesOnDate(job, dateStr).length > 0);
              }).length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-10 border border-dashed rounded-lg">
                  ไม่มีงานในเดือนนี้
                </div>
              ) : (
                days.map(day => {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dateObj = new Date(dateStr);
                  const dayOfWeek = dateObj.getDay();
                  const isToday = new Date().toDateString() === dateObj.toDateString();
                  const dayJobs = jobList.filter(job => getPhasesOnDate(job, dateStr).length > 0);
                  if (dayJobs.length === 0) return null;

                  return (
                    <div key={day} className={`border rounded-xl overflow-hidden ${isToday ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}>
                      <div className={`px-3 py-2 flex items-center gap-2 ${isToday ? 'bg-blue-600 text-white' : THAI_DAY_COLORS[dayOfWeek]}`}>
                        <span className="text-xl font-black">{day}</span>
                        <div className="leading-tight">
                          <div className="text-xs font-bold">{dayNames[dayOfWeek]}</div>
                          <div className="text-[10px] opacity-80">{isToday ? 'วันนี้' : dateObj.toLocaleDateString('th-TH', { month: 'short' })}</div>
                        </div>
                        <span className="ml-auto text-[11px] font-bold bg-white/40 px-2 py-0.5 rounded-full">{dayJobs.length} งาน</span>
                      </div>

                      <div className="p-2 space-y-2 bg-white">
                        {dayJobs.map(job => {
                          const phasesToday = getPhasesOnDate(job, dateStr);
                          phasesToday.sort((a, b) => a.startTime.localeCompare(b.startTime));
                          const dailyStaffIds = getStaffOnDate(job, dateStr);
                          const staffNames = dailyStaffIds.map(id => {
                            const s = staffList.find(staff => staff.id === id);
                            if (!s) return '';
                            return s.role === 'Outsource Team' && s.headcount > 1 ? `${s.name}(${s.headcount})` : s.name;
                          }).filter(Boolean);

                          return (
                            <div
                              key={`${job.id}-${day}`}
                              onClick={() => { if (currentUserRole === 'admin') setDailyEditContext({ job, date: dateStr }); }}
                              className={`p-3 rounded-lg border ${job.color || STATUS_COLORS[job.status]} ${currentUserRole === 'admin' ? 'cursor-pointer active:opacity-70' : ''}`}
                            >
                              <div className="flex justify-between items-start gap-2 mb-1.5">
                                <div className="text-sm font-bold leading-tight">{job.name}</div>
                                <span className="text-[10px] whitespace-nowrap bg-white/60 px-1.5 py-0.5 rounded">{job.status}</span>
                              </div>

                              {job.location && (
                                <div className="text-[11px] mb-1.5">
                                  <LocationLink job={job} size={11} />
                                </div>
                              )}

                              <div className="space-y-1 mb-2">
                                {phasesToday.map((p, idx) => (
                                  <div key={idx} className="flex items-center gap-2 bg-white/70 rounded px-2 py-1">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getPhaseColor(p.type)}`}></span>
                                    <span className="text-[11px] font-bold flex-1">{p.type}</span>
                                    <span className="text-[11px] text-gray-700 font-mono">{p.startTime}-{p.endTime}</span>
                                  </div>
                                ))}
                              </div>

                              <div className="text-[11px] text-gray-700 bg-white/50 rounded px-2 py-1 leading-relaxed">
                                👥 {staffNames.length > 0 ? staffNames.join(', ') : 'ยังไม่ได้จัดคน'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
          <div className="grid grid-cols-7 border-l border-t border-gray-200 rounded-lg overflow-y-auto" style={{maxHeight: 'max(340px, calc(100vh - 260px))'}}>
            {dayNames.map((day, idx) => <div key={day} className={`p-2 text-center text-[12px] font-bold uppercase sticky top-0 z-20 shadow-sm border-r border-b ${THAI_DAY_COLORS[idx]}`}>{day}</div>)}
            {blanks.map(i => <div key={`blank-${i}`} className={`border-r border-b border-gray-200 ${THAI_DAY_CELL_BGS[i]}`} style={{minHeight: 140}}></div>)}

            {days.map(day => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dateObj = new Date(dateStr);
              const dayOfWeek = dateObj.getDay();
              const isToday = new Date().toDateString() === dateObj.toDateString();
              const dayJobs = jobList.filter(job => getPhasesOnDate(job, dateStr).length > 0);

              return (
                <div key={day} className={`p-1.5 flex flex-col border-r border-b border-gray-200 transition-colors ${isToday ? 'bg-blue-50/60 ring-2 ring-inset ring-blue-400' : THAI_DAY_CELL_BGS[dayOfWeek]}`} style={{minHeight: 140}}>
                  <div className={`text-right text-base font-extrabold mb-1 ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                    {isToday ? <span className="bg-blue-600 text-white w-7 h-7 inline-flex items-center justify-center rounded-full shadow-sm">{day}</span> : day}
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5">
                    {dayJobs.map(job => {
                      const phasesToday = getPhasesOnDate(job, dateStr);
                      phasesToday.sort((a, b) => a.startTime.localeCompare(b.startTime));

                      const dailyStaffIds = getStaffOnDate(job, dateStr);
                      const staffNames = dailyStaffIds.map(id => {
                        const s = staffList.find(staff => staff.id === id);
                        if (!s) return '';
                        return s.role === 'Outsource Team' && s.headcount > 1 ? `${s.name}(${s.headcount})` : s.name;
                      }).filter(Boolean);

                      return (
                        <div
                          key={`${job.id}-${day}`}
                          onClick={() => {
                            if (currentUserRole === 'admin') {
                              setDailyEditContext({ job, date: dateStr });
                            }
                          }}
                          className={`p-1.5 rounded cursor-pointer leading-tight border ${job.color || STATUS_COLORS[job.status]} hover:shadow-md transition-shadow group relative`}
                        >
                          <div className="flex justify-between items-start mb-0.5">
                             <div className="text-[11px] font-bold truncate group-hover:opacity-80">{job.name}</div>
                             {job.color && (
                                 <div className="text-[8px] opacity-70 whitespace-nowrap bg-white/50 px-1 rounded-sm">{job.status}</div>
                             )}
                          </div>

                          {phasesToday.map((p, idx) => (
                            <div key={idx} className="text-[10px] mt-0.5 font-medium bg-white/60 rounded p-0.5 flex flex-col">
                              <span className={`font-bold ${getPhaseColor(p.type).replace('bg-', 'text-')}`}>{p.type}</span>
                              <span className="text-gray-600">{p.startTime}-{p.endTime}</span>
                            </div>
                          ))}

                          <div className="text-[9px] mt-1 text-gray-700 line-clamp-2 leading-tight bg-white/40 p-0.5 rounded">
                            👥 {staffNames.length > 0 ? staffNames.join(', ') : 'ไม่ได้จัดคน'}
                          </div>

                          {job.location && (
                            <div className="text-[9px] mt-1 bg-white/40 p-0.5 rounded leading-tight overflow-hidden">
                              <LocationLink job={job} size={9} />
                            </div>
                          )}

                          {job.dailyOverrides && job.dailyOverrides[dateStr] && (
                             <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border border-white shadow-sm" title="มีการปรับเวลา/คน เฉพาะวันนี้"></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-4 border-b pb-3">
            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
              <CalendarIcon size={20} className="text-blue-600"/> ตารางสรุปภาพรวมงานประจำเดือน {currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
            </h3>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
              รวม {monthlyCalendarJobs.length} งาน
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-blue-50 text-blue-800 uppercase font-bold text-[11px]">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">เริ่มวันแรก</th>
                  <th className="px-4 py-3">ชื่องาน</th>
                  <th className="px-4 py-3">สถานที่</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {monthlyCalendarJobs.length === 0 ? (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500 bg-gray-50/50">ไม่มีงานในเดือนนี้</td></tr>
                ) : (
                  monthlyCalendarJobs.map((job) => {
                    const sortedPhases = [...(job.phases || [])].sort((a, b) => new Date(a.startDate || a.date) - new Date(b.startDate || b.date));
                    const firstDate = sortedPhases.length > 0 ? formatThaiDate(sortedPhases[0].startDate || sortedPhases[0].date) : '-';
                    const mapUrl = getMapUrl(job);

                    return (
                      <tr key={job.id} className="bg-white border-b hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => { if(currentUserRole==='admin') { setEditingJob(job); setIsJobModalOpen(true); } }}>
                        <td className="px-4 py-3 font-medium text-blue-600 whitespace-nowrap">{firstDate}</td>
                        <td className="px-4 py-3 font-bold text-gray-900">{job.name}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {mapUrl ? (
                              <a href={mapUrl} target="_blank" rel="noopener noreferrer" title={'เปิดแผนที่: ' + (job.location || '')} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline" onClick={e => e.stopPropagation()}>
                                  <MapPin size={14} /> {job.location || 'ดูแผนที่'}
                              </a>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${job.color || STATUS_COLORS[job.status]}`}>{job.status}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // นับจำนวนวันที่แต่ละคนมีงานในเดือนที่กำลังดู (ใช้เรียงตามความยุ่ง/ความว่าง)
  const countBusyDays = (staffId, year, month) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let n = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const has = jobList.some(job =>
        job.status !== JOB_STATUSES.CANCELLED &&
        getStaffOnDate(job, dateStr).includes(staffId) &&
        getPhasesOnDate(job, dateStr).length > 0
      );
      if (has) n++;
    }
    return n;
  };

  const sortGanttStaff = (list, mode, year, month) => {
    const arr = [...list];
    if (mode === 'name') {
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
    } else if (mode === 'busy' || mode === 'free') {
      const cache = new Map();
      const busyOf = (s) => {
        if (!cache.has(s.id)) cache.set(s.id, countBusyDays(s.id, year, month));
        return cache.get(s.id);
      };
      arr.sort((a, b) => {
        const diff = mode === 'busy' ? busyOf(b) - busyOf(a) : busyOf(a) - busyOf(b);
        return diff !== 0 ? diff : (a.name || '').localeCompare(b.name || '', 'th');
      });
    } else {
      // ตามตำแหน่ง: เรียงตามลำดับใน ROLES ก่อน แล้วตำแหน่งที่พิมพ์เองต่อท้าย
      arr.sort((a, b) => {
        const ia = ROLES.indexOf(a.role); const ib = ROLES.indexOf(b.role);
        const ra = ia === -1 ? ROLES.length : ia;
        const rb = ib === -1 ? ROLES.length : ib;
        if (ra !== rb) return ra - rb;
        const roleCmp = (a.role || '').localeCompare(b.role || '', 'th');
        if (roleCmp !== 0) return roleCmp;
        return (a.name || '').localeCompare(b.name || '', 'th');
      });
    }
    return arr;
  };

  const renderGanttChart = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const dayNamesShort = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const sortedGanttStaff = sortGanttStaff(staffList, ganttSort, year, month);

    // ===== มุมมองมือถือ: แสดงเป็นการ์ดรายคน อ่านง่ายกว่าตารางกว้าง 800px =====
    if (isMobile) {
      return (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex justify-between items-center gap-2">
              <h2 className="text-lg font-bold text-gray-800">ตารางคิวทีมงาน</h2>
              <div className="flex gap-2">
                <button onClick={() => setCurrentDate(new Date(year, month - 1))} className="p-2 border rounded hover:bg-gray-50"><ChevronLeft size={18} /></button>
                <button onClick={() => setCurrentDate(new Date(year, month + 1))} className="p-2 border rounded hover:bg-gray-50"><ChevronRight size={18} /></button>
              </div>
            </div>
            <div className="text-sm font-bold text-blue-600 mt-2">
              {currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <label className="text-xs font-bold text-gray-500 flex-shrink-0">เรียงตาม:</label>
              <select
                value={ganttSort}
                onChange={e => setGanttSort(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg text-sm p-2 bg-white outline-none focus:border-blue-500 font-medium"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {staffList.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-10 border border-dashed rounded-lg bg-white">
              ยังไม่มีรายชื่อทีมงานในระบบ
            </div>
          ) : (
            sortedGanttStaff.map(staff => {
              // รวบรวมวันทำงานของคนนี้ในเดือนที่เลือก
              const workDays = [];
              days.forEach(day => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                jobList.forEach(job => {
                  if (getStaffOnDate(job, dateStr).includes(staff.id)) {
                    const phases = getPhasesOnDate(job, dateStr);
                    if (phases.length > 0) {
                      workDays.push({ day, dateStr, job, phases });
                    }
                  }
                });
              });

              return (
                <div key={staff.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center gap-2">
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{staff.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {staff.role} {staff.headcount > 1 ? `(${staff.headcount} คน)` : ''}
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${workDays.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                      {workDays.length > 0 ? `เข้างาน ${workDays.length} วัน` : 'ว่างทั้งเดือน'}
                    </span>
                  </div>

                  {workDays.length > 0 && (
                    <div className="divide-y">
                      {workDays.map((w, i) => {
                        const dObj = new Date(w.dateStr);
                        const isToday = new Date().toDateString() === dObj.toDateString();
                        return (
                          <div
                            key={i}
                            onClick={() => { if (currentUserRole === 'admin') setDailyEditContext({ job: w.job, date: w.dateStr }); }}
                            className={`px-3 py-2.5 flex gap-3 ${currentUserRole === 'admin' ? 'active:bg-gray-50' : ''}`}
                          >
                            <div className={`flex flex-col items-center justify-center rounded-lg px-2 py-1 flex-shrink-0 ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`} style={{minWidth: 42}}>
                              <span className="text-base font-black leading-none">{w.day}</span>
                              <span className="text-[9px] font-bold mt-0.5">{dayNamesShort[dObj.getDay()]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-bold text-gray-900 leading-tight mb-1">{w.job.name}</div>
                              <div className="flex flex-wrap gap-1">
                                {w.phases.map((p, pi) => (
                                  <span key={pi} className={`text-[10px] text-white font-bold px-1.5 py-0.5 rounded ${getPhaseColor(p.type)}`}>
                                    {p.type} {p.startTime}-{p.endTime}
                                  </span>
                                ))}
                              </div>
                              {w.job.location && (
                                <div className="text-[10px] mt-1">
                                  <LocationLink job={w.job} size={10} />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl shadow-sm border p-4 overflow-x-auto">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3 sticky left-0">
          <h2 className="text-xl font-bold text-gray-800">ตารางคิวทีมงาน / Outsource</h2>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-500">เรียงตาม:</label>
              <select
                value={ganttSort}
                onChange={e => setGanttSort(e.target.value)}
                className="border border-gray-300 rounded-lg text-sm p-1.5 bg-white outline-none focus:border-blue-500 font-medium"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border shadow-sm">
              <button onClick={() => setCurrentDate(new Date(year, month - 1))} className="p-1.5 hover:bg-white rounded transition-colors text-gray-600"><ChevronLeft size={20} /></button>
              <span className="font-bold text-gray-800 text-center select-none" style={{minWidth: 130}}>
                {currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => setCurrentDate(new Date(year, month + 1))} className="p-1.5 hover:bg-white rounded transition-colors text-gray-600"><ChevronRight size={20} /></button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mb-4 sticky left-0 text-[11px] bg-gray-50 p-2.5 rounded-lg border w-fit shadow-sm">
          <span className="font-bold text-gray-700">สัญลักษณ์กิจกรรม:</span>
          {PHASE_TYPES.map(type => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded shadow-sm ${PHASE_COLORS[type] || 'bg-gray-500'}`}></span>
              <span className="text-gray-700 font-medium">{type}</span>
            </div>
          ))}
        </div>

        <div style={{minWidth: 1200}}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-gray-200 p-2 bg-gray-50 w-48 text-left sticky left-0 z-10 font-bold text-gray-700 align-bottom" style={{boxShadow: "2px 0 4px -2px rgba(0,0,0,0.1)"}}>รายชื่อ / ตำแหน่ง</th>
                {days.map(day => {
                  const dateObj = new Date(year, month, day);
                  const dayOfWeek = dateObj.getDay();
                  const isSunday = dayOfWeek === 0;
                  const isToday = new Date().toDateString() === dateObj.toDateString();

                  return (
                    <th key={day} className={`border border-gray-200 p-1 text-xs text-center ${isToday ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-600'} ${isSunday ? 'border-r-2 border-r-gray-400' : ''}`} style={{minWidth: 104}}>
                      <div className="font-bold">{dayNamesShort[dayOfWeek]}</div>
                      <div className={isToday ? 'font-black' : 'font-medium'}>{day}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedGanttStaff.map((staff, index) => {
                const STAFF_BGS = ['bg-blue-50', 'bg-green-50', 'bg-yellow-50', 'bg-red-50', 'bg-purple-50', 'bg-pink-50', 'bg-orange-50', 'bg-teal-50'];
                const staffBg = STAFF_BGS[index % STAFF_BGS.length];

                return (
                <tr key={staff.id} className={`${staffBg} hover:opacity-80 transition-colors`}>
                  <td className={`border border-gray-200 p-2 font-medium sticky left-0 z-10 ${staffBg}`} style={{boxShadow: "2px 0 4px -2px rgba(0,0,0,0.1)"}}>
                    <div className="text-gray-900">{staff.name}</div>
                    <div className="text-[10px] text-gray-500">{staff.role} {staff.headcount > 1 ? `(จำนวน ${staff.headcount} คน)` : ''}</div>
                  </td>
                  {days.map(day => {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dateObj = new Date(year, month, day);
                    const isSunday = dateObj.getDay() === 0;

                    const staffJobsOnDate = jobList.filter(job =>
                      getStaffOnDate(job, dateStr).includes(staff.id) &&
                      getPhasesOnDate(job, dateStr).length > 0
                    );

                    return (
                      <td key={day} className={`border border-gray-200 p-0.5 align-top relative ${staffJobsOnDate.length > 0 ? 'bg-black/5 shadow-inner' : ''} ${isSunday ? 'border-r-2 border-r-gray-400' : ''}`}>
                        {staffJobsOnDate.map((job, idx) => {
                           const phasesToday = getPhasesOnDate(job, dateStr);
                           return phasesToday.map((p, pIdx) => (
                            <div
                              key={`${idx}-${pIdx}`}
                              onClick={() => { if (currentUserRole === 'admin') setDailyEditContext({ job, date: dateStr }); }}
                              className={`mx-0.5 mb-0.5 px-1 py-0.5 ${getPhaseColor(p.type)} rounded text-white cursor-pointer hover:opacity-80 transition-opacity shadow-sm leading-tight`}
                              title={`${job.name}\nกิจกรรม: ${p.type}\nเวลา: ${p.startTime}-${p.endTime}${job.location ? '\nสถานที่: ' + job.location : ''}`}
                            >
                              <div className="text-[10px] font-bold truncate">{job.name}</div>
                              <div className="text-[9px] font-medium opacity-95 truncate">{p.startTime}-{p.endTime}</div>
                            </div>
                           ));
                        })}
                      </td>
                    );
                  })}
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <div className="bg-white border-b shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="L&E BEYOND" className="h-10 w-auto object-contain flex-shrink-0" />
            <div className="hidden sm:flex flex-col">
              <h1 className="text-2xl font-black text-gray-800 tracking-tight leading-none">L&E BEYOND</h1>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">Team Schedule</span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 ml-3 pl-3 border-l text-[11px] text-gray-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span>{isSaving ? 'กำลังบันทึก...' : lastSyncedAt ? `อัปเดตล่าสุด ${lastSyncedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'กำลังซิงค์...'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <select
              value={currentUserRole}
              onChange={handleRoleSelect}
              className="border border-gray-300 rounded-lg text-sm p-1.5 md:p-2 bg-gray-50 focus:ring-2 focus:border-blue-500 font-bold outline-none cursor-pointer"
            >
              <option value="staff">👀 Staff</option>
              <option value="admin">👤 Admin</option>
            </select>

            {currentUserRole === 'admin' && (
              <>
                <div className="flex items-center gap-1 mr-1 border-r pr-3">
                  <button onClick={handleExportData} title="ดาวน์โหลดไฟล์สำรองข้อมูล (Backup)" className="flex items-center gap-1.5 px-3 py-2 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm font-bold transition-colors"><Download size={16} /> <span className="hidden sm:inline">สำรองข้อมูล</span></button>
                  <button onClick={handleCopyBackup} title="คัดลอกข้อมูลสำรองลงคลิปบอร์ด (ใช้เมื่อดาวน์โหลดไม่ได้)" className="flex items-center gap-1.5 px-3 py-2 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm font-bold transition-colors"><Copy size={16} /></button>
                  <input type="file" accept=".json" style={{display: 'none'}} ref={fileInputRef} onChange={handleImportData} />
                  <button onClick={() => fileInputRef.current.click()} title="กู้คืนจากไฟล์" className="flex items-center gap-1.5 px-3 py-2 text-green-700 bg-green-50 hover:bg-green-100 rounded-lg text-sm font-bold transition-colors"><Upload size={16} /> <span className="hidden sm:inline">กู้คืน</span></button>
                  <button onClick={handlePasteRestore} title="กู้คืนโดยวางข้อมูลที่คัดลอกไว้" className="flex items-center gap-1.5 px-3 py-2 text-green-700 bg-green-50 hover:bg-green-100 rounded-lg text-sm font-bold transition-colors"><Edit size={16} /></button>
                </div>
                <button onClick={() => setIsStaffManagementModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-bold transition-colors">
                  <Settings size={18} /> <span className="hidden md:inline">จัดการพนักงาน</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex bg-white rounded-lg shadow-sm border p-1 inline-flex w-full md:w-auto overflow-x-auto">
            <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><LayoutDashboard size={18} /> ภาพรวม</button>
            <button onClick={() => setActiveTab('calendar')} className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'calendar' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><CalendarIcon size={18} /> ปฏิทินงาน</button>
            <button onClick={() => setActiveTab('gantt')} className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'gantt' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}><Users size={18} /> ตารางคิว</button>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            {currentUserRole === 'admin' && (
              <>
                <button onClick={() => { setEditingJob(null); setIsJobModalOpen(true); }} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"><Plus size={18} /> สร้างงานใหม่</button>
                <button onClick={() => setIsLineSummaryOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-[#00B900] hover:bg-[#009900] text-white rounded-lg text-sm font-bold shadow-sm transition-colors"><Copy size={18} /> ส่งลง Line</button>
              </>
            )}
          </div>
        </div>

        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'calendar' && renderCalendar()}
        {activeTab === 'gantt' && renderGanttChart()}
      </div>

      <JobFormModal
        key={isJobModalOpen ? `job-${editingJob?.id || 'new'}` : 'job-closed'}
        isJobModalOpen={isJobModalOpen}
        setIsJobModalOpen={setIsJobModalOpen}
        editingJob={editingJob}
        setEditingJob={setEditingJob}
        handleSaveJob={handleSaveJob}
        handleDeleteJob={handleDeleteJob}
        staffList={staffList}
        setDialog={setDialog}
        savedLocations={savedLocations}
      />

      <DailyEditModal
        key={dailyEditContext ? `daily-${dailyEditContext.job.id}-${dailyEditContext.date}` : 'daily-closed'}
        dailyEditContext={dailyEditContext}
        setDailyEditContext={setDailyEditContext}
        staffList={staffList}
        handleSaveJob={handleSaveJob}
        setEditingJob={setEditingJob}
        setIsJobModalOpen={setIsJobModalOpen}
      />

      {isStaffManagementModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center overflow-y-auto z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6 flex flex-col" style={{maxHeight: '90vh'}}>
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h2 className="text-xl font-bold flex items-center gap-2"><Users size={24} className="text-blue-600"/> ฐานข้อมูลพนักงาน/Outsource</h2>
              <button onClick={() => setIsStaffManagementModalOpen(false)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-inner">
              <div className="flex justify-between items-center mb-3">
                 <h3 className="font-bold text-sm text-gray-800">{editingStaffId ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มรายชื่อใหม่'}</h3>
                 {editingStaffId && (
                     <button type="button" onClick={() => { setEditingStaffId(null); setStaffForm({ name: '', role: ROLES[0], customRole: '', phone: '', headcount: 1 }); }} className="text-xs text-gray-500 hover:text-gray-800 underline">ยกเลิกการแก้ไข</button>
                 )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">ชื่อ/บริษัท *</label>
                  <input name="name" required value={staffForm.name} onChange={e => setStaffForm({...staffForm, name: e.target.value})} placeholder="ระบุชื่อ" className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">ตำแหน่ง *</label>
                  <select name="role" value={staffForm.role} onChange={e => setStaffForm({...staffForm, role: e.target.value, customRole: e.target.value === CUSTOM_ROLE ? (staffForm.customRole || '') : ''})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    <option value={CUSTOM_ROLE}>อื่นๆ (ระบุเอง)</option>
                  </select>
                  {staffForm.role === CUSTOM_ROLE && (
                    <input
                      type="text"
                      value={staffForm.customRole || ''}
                      onChange={e => setStaffForm({...staffForm, customRole: e.target.value})}
                      placeholder="พิมพ์ชื่อตำแหน่ง เช่น Rigger"
                      className="w-full border border-blue-300 rounded p-2 text-sm outline-none mt-1.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">เบอร์ติดต่อ</label>
                  <input name="phone" value={staffForm.phone} onChange={e => setStaffForm({...staffForm, phone: e.target.value})} placeholder="ระบุเบอร์" className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                </div>
                {(staffForm.role === 'Outsource Team' || (staffForm.role === CUSTOM_ROLE && (staffForm.customRole||'').trim() === 'Outsource Team')) ? (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">จำนวน(คน)</label>
                    <input name="headcount" type="number" min="1" value={staffForm.headcount} onChange={e => setStaffForm({...staffForm, headcount: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                  </div>
                ) : <div></div>}
                <div className="md:col-span-full mt-2">
                  <button type="button" onClick={handleSaveStaff} className={`w-full text-white rounded p-2 text-sm font-bold transition-colors shadow-sm ${editingStaffId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                     {editingStaffId ? 'บันทึกการแก้ไข' : 'เพิ่มเข้าสู่ระบบ'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
               <h3 className="font-bold text-sm mb-2 text-gray-800">รายชื่อในระบบ ({staffList.length})</h3>
               <div className="space-y-2">
                 {staffList.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-6 border border-dashed rounded-lg">ยังไม่มีข้อมูล</p>
                 ) : (
                    staffList.map(staff => (
                        <div key={staff.id} className={`flex justify-between items-center p-3 border rounded-lg transition-colors ${editingStaffId === staff.id ? 'border-orange-300 bg-orange-50' : 'hover:border-blue-300 hover:bg-blue-50'}`}>
                           <div>
                             <div className="font-bold text-sm text-gray-800">{staff.name}</div>
                             <div className="text-[11px] text-gray-500 mt-0.5">
                               {staff.role} {staff.headcount > 1 ? `(จำนวน ${staff.headcount} คน)` : ''} {staff.phone ? `• โทร: ${staff.phone}` : ''}
                             </div>
                           </div>
                           <div className="flex gap-1">
                             <button onClick={() => handleEditStaffClick(staff)} className="p-2 text-gray-500 hover:text-orange-500 hover:bg-orange-100 rounded-lg transition-colors" title="แก้ไข"><Edit size={18} /></button>
                             <button onClick={() => handleDeleteStaff(staff.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-100 rounded-lg transition-colors" title="ลบรายชื่อ"><Trash2 size={18} /></button>
                           </div>
                        </div>
                      ))
                    )}
                 </div>
            </div>
          </div>
        </div>
      )}

      {isLineSummaryOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center overflow-y-auto z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2"><Copy size={20} className="text-[#00B900]"/> สรุปคิวงานส่ง Line</h2>
              <button onClick={() => setIsLineSummaryOpen(false)} className="p-1 text-gray-500 rounded-full hover:bg-gray-100 transition-colors"><X size={20} /></button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-bold mb-1 text-gray-700">เลือกวันที่ต้องการสรุป</label>
              <input type="date" value={currentDate.toISOString().split('T')[0]} onChange={(e) => e.target.value && setCurrentDate(new Date(e.target.value))} className="border border-gray-300 p-2 rounded-lg w-full text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <textarea readOnly value={generateLineSummary()} className="w-full h-64 border border-gray-300 rounded-lg p-3 text-sm bg-gray-50 font-mono text-gray-800 outline-none resize-none shadow-inner" />
            <button
              onClick={async () => {
                const text = generateLineSummary();
                let done = false;
                // วิธีหลัก
                try {
                  await navigator.clipboard.writeText(text);
                  done = true;
                } catch (err) {
                  // วิธีสำรอง: เผื่อเบราว์เซอร์บล็อก clipboard (เช่นเปิดผ่าน http หรือใน webview)
                  try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    done = document.execCommand('copy');
                    document.body.removeChild(ta);
                  } catch (e2) { done = false; }
                }
                if (done) {
                  setIsLineSummaryOpen(false);
                  setDialog({ isOpen: true, type: 'info', message: 'คัดลอกข้อความทั้งหมดเรียบร้อย นำไปวางในไลน์ได้เลย!' });
                } else {
                  setDialog({ isOpen: true, type: 'info', message: 'คัดลอกอัตโนมัติไม่สำเร็จ (เบราว์เซอร์บล็อกไว้)\n\nให้กดค้างในกล่องข้อความ แล้วเลือกทั้งหมด → คัดลอก แทนครับ' });
                }
              }}
              className="w-full mt-4 px-4 py-3 bg-[#00B900] text-white rounded-lg hover:bg-[#009900] font-bold shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <Copy size={18} /> คัดลอกข้อความทั้งหมด
            </button>
          </div>
        </div>
      )}

      <CustomDialog dialog={dialog} setDialog={setDialog} />
    </div>
  );
}
