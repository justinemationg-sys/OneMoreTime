import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Info, HelpCircle, ChevronDown, ChevronUp, Clock, X } from 'lucide-react';
import { Task, UserSettings, StudyPlan, FixedCommitment } from '../types';
import { checkFrequencyDeadlineConflict, findNextAvailableTimeSlot, doesCommitmentApplyToDate, getEffectiveStudyWindow } from '../utils/scheduling';
import TimeEstimationModal from './TimeEstimationModal';

interface TaskInputProps {
  onAddTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  onCancel?: () => void;
  userSettings: UserSettings;
  existingStudyPlans?: StudyPlan[];
  fixedCommitments?: FixedCommitment[];
}

const TaskInputSimplified: React.FC<TaskInputProps> = ({ onAddTask, onCancel, userSettings, existingStudyPlans = [], fixedCommitments = [] }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    deadline: '',
    estimatedHours: '',
    estimatedMinutes: '0',
    category: '',
    customCategory: '',
    impact: '',
    taskType: '',
    deadlineType: 'hard' as 'hard' | 'soft' | 'none',
    schedulingPreference: 'consistent' as 'consistent' | 'opportunistic' | 'intensive',
    targetFrequency: 'daily' as 'daily' | 'weekly' | '3x-week' | 'flexible',
    maxSessionLength: 2, // Default 2 hours for no-deadline tasks
    isOneTimeTask: false,
    startDate: new Date().toISOString().split('T')[0],
    // Session-based estimation fields
    estimationMode: 'total' as 'total' | 'session',
    sessionDurationHours: '',
    sessionDurationMinutes: '30',
  });

  const [showTimeEstimationModal, setShowTimeEstimationModal] = useState(false);
  const [showTaskTimeline, setShowTaskTimeline] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  
  // Quick time presets
  const [showTimePresets, setShowTimePresets] = useState(false);
  const [showSessionPresets, setShowSessionPresets] = useState(false);
  const timePresets = [
    { label: '15m', hours: '0', minutes: '15' },
    { label: '30m', hours: '0', minutes: '30' },
    { label: '45m', hours: '0', minutes: '45' },
    { label: '1h', hours: '1', minutes: '0' },
    { label: '1h 30m', hours: '1', minutes: '30' },
    { label: '2h', hours: '2', minutes: '0' },
    { label: '3h', hours: '3', minutes: '0' },
  ];

  const sessionPresets = [
    { label: '15m', hours: '0', minutes: '15' },
    { label: '30m', hours: '0', minutes: '30' },
    { label: '45m', hours: '0', minutes: '45' },
    { label: '1h', hours: '1', minutes: '0' },
    { label: '1h 30m', hours: '1', minutes: '30' },
    { label: '2h', hours: '2', minutes: '0' },
  ];

  // Auto-detect deadline type based on whether deadline is set
  useEffect(() => {
    if (formData.deadline && formData.deadline.trim() !== '') {
      // User set a deadline - keep current deadlineType or default to 'hard'
      if (formData.deadlineType === 'none') {
        setFormData(f => ({ ...f, deadlineType: 'hard' }));
      }
    } else {
      // No deadline set - automatically set to 'none'
      setFormData(f => ({ ...f, deadlineType: 'none' }));
    }
  }, [formData.deadline]);

  // Reset conflicting options when one-sitting task is toggled
  useEffect(() => {
    if (formData.isOneTimeTask) {
      // One-sitting tasks don't need frequency preferences, don't use start dates, and must use total time estimation
      setFormData(f => ({ ...f, targetFrequency: 'daily', estimationMode: 'total' }));
    }
  }, [formData.isOneTimeTask]);

  // Validation functions
  const convertToDecimalHours = (hours: string, minutes: string): number => {
    return parseInt(hours || '0') + parseInt(minutes || '0') / 60;
  };

  // Calculate total time from session-based estimation
  const calculateSessionBasedTotal = useMemo(() => {
    if (formData.estimationMode !== 'session' || !formData.deadline || formData.deadlineType === 'none') {
      return 0;
    }

    const sessionDuration = convertToDecimalHours(formData.sessionDurationHours, formData.sessionDurationMinutes);
    if (sessionDuration <= 0) return 0;

    const startDate = new Date(formData.startDate || new Date().toISOString().split('T')[0]);
    const deadlineDate = new Date(formData.deadline);
    const timeDiff = deadlineDate.getTime() - startDate.getTime();
    const totalDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day

    let workDays = 0;
    switch (formData.targetFrequency) {
      case 'daily':
        workDays = totalDays;
        break;
      case '3x-week':
        workDays = Math.floor((totalDays / 7) * 3) + Math.min(3, totalDays % 7);
        break;
      case 'weekly':
        workDays = Math.ceil(totalDays / 7);
        break;
      case 'flexible':
        workDays = Math.ceil(totalDays * 0.7); // Assume 70% of days for flexible
        break;
      default:
        workDays = totalDays;
    }

    return sessionDuration * workDays;
  }, [formData.estimationMode, formData.sessionDurationHours, formData.sessionDurationMinutes, formData.deadline, formData.deadlineType, formData.startDate, formData.targetFrequency]);

  // Get effective total time (either direct input or calculated from sessions)
  const getEffectiveTotalTime = () => {
    if (formData.estimationMode === 'session') {
      return calculateSessionBasedTotal;
    }
    return convertToDecimalHours(formData.estimatedHours, formData.estimatedMinutes);
  };

  // Check time restrictions for frequency preferences
  const frequencyRestrictions = useMemo(() => {
    if (!formData.deadline || formData.deadlineType === 'none') {
      return { disableWeekly: false, disable3xWeek: false };
    }

    const startDate = new Date(formData.startDate || new Date().toISOString().split('T')[0]);
    const deadlineDate = new Date(formData.deadline);
    const timeDiff = deadlineDate.getTime() - startDate.getTime();
    const daysUntilDeadline = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    return {
      disableWeekly: daysUntilDeadline < 14, // Less than 2 weeks
      disable3xWeek: daysUntilDeadline < 7   // Less than 1 week
    };
  }, [formData.deadline, formData.deadlineType, formData.startDate]);

  // Auto-adjust frequency when restrictions change
  useEffect(() => {
    if (frequencyRestrictions.disableWeekly && formData.targetFrequency === 'weekly') {
      setFormData(prev => ({ ...prev, targetFrequency: 'daily' }));
    }
    if (frequencyRestrictions.disable3xWeek && formData.targetFrequency === '3x-week') {
      setFormData(prev => ({ ...prev, targetFrequency: 'daily' }));
    }
  }, [frequencyRestrictions.disableWeekly, frequencyRestrictions.disable3xWeek, formData.targetFrequency]);

  // Check if deadline conflicts with frequency preference
  const deadlineConflict = useMemo(() => {
    if (!formData.deadline || formData.deadlineType === 'none' || formData.isOneTimeTask) {
      return { hasConflict: false };
    }

    const effectiveTime = getEffectiveTotalTime();
    if (effectiveTime <= 0) {
      return { hasConflict: false };
    }

    return checkFrequencyDeadlineConflict(
      formData.targetFrequency,
      effectiveTime,
      formData.deadline,
      formData.startDate || today,
      userSettings.dailyAvailableHours
    );
  }, [formData.targetFrequency, formData.deadline, formData.deadlineType, formData.startDate, formData.isOneTimeTask, getEffectiveTotalTime(), userSettings.dailyAvailableHours, today]);

  // Show custom category input when "Custom..." is selected
  const showCustomCategory = formData.category === 'Custom...';

  // Validation
  const totalTime = convertToDecimalHours(formData.estimatedHours, formData.estimatedMinutes);
  const estimatedDecimalHours = getEffectiveTotalTime();

  const isDeadlineValid = !formData.deadline || new Date(formData.deadline) >= new Date(today);
  const isStartDateValid = !formData.startDate || new Date(formData.startDate) >= new Date(today);

  // One-sitting task validation checks
  const isOneSittingTooLong = formData.isOneTimeTask && estimatedDecimalHours > userSettings.dailyAvailableHours;

  // Check if deadline allows for one-sitting task
  const oneSittingTimeSlotCheck = useMemo(() => {
    if (!formData.isOneTimeTask || !formData.deadline || estimatedDecimalHours <= 0) {
      return { hasSlot: true, message: '' };
    }

    const deadlineDate = formData.deadline;
    const timeSlot = findNextAvailableTimeSlot(
      deadlineDate,
      estimatedDecimalHours,
      userSettings,
      fixedCommitments,
      existingStudyPlans
    );

    if (!timeSlot.found) {
      return {
        hasSlot: false,
        message: timeSlot.reason || 'No available time slot found for this one-sitting task on the deadline date.'
      };
    }

    return { hasSlot: true, message: '' };
  }, [formData.isOneTimeTask, formData.deadline, estimatedDecimalHours, userSettings, fixedCommitments, existingStudyPlans]);

  const isOneSittingNoTimeSlot = formData.isOneTimeTask && !oneSittingTimeSlotCheck.hasSlot;

  const isFormValid = formData.title.trim() && 
                     (totalTime > 0 || (formData.estimationMode === 'session' && calculateSessionBasedTotal > 0)) &&
                     formData.impact && 
                     isDeadlineValid && 
                     isStartDateValid &&
                     (!formData.isOneTimeTask || (formData.deadline && !isOneSittingTooLong && !isOneSittingNoTimeSlot));

  const formatTimeDisplay = (hours: string, minutes: string) => {
    const h = parseInt(hours || '0');
    const m = parseInt(minutes || '0');
    if (h === 0 && m === 0) return 'Not set';
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const getValidationErrors = () => {
    const errors: string[] = [];
    if (!formData.title.trim()) errors.push('Task title is required');
    if (totalTime <= 0 && (formData.estimationMode !== 'session' || calculateSessionBasedTotal <= 0)) {
      errors.push('Time estimation is required');
    }
    if (!formData.impact) errors.push('Task importance is required');
    if (!isDeadlineValid) errors.push('Deadline cannot be in the past');
    if (!isStartDateValid) errors.push('Start date cannot be in the past');
    if (formData.isOneTimeTask && !formData.deadline) errors.push('One-sitting tasks require a deadline');
    if (isOneSittingTooLong) errors.push('One-sitting task duration exceeds daily available hours');
    if (isOneSittingNoTimeSlot) errors.push('No available time slot for one-sitting task on deadline date');
    return errors;
  };

  const getValidationWarnings = () => {
    const warnings: string[] = [];
    return warnings;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      setShowValidationErrors(true);
      return;
    }
    
    const category = showCustomCategory ? formData.customCategory : formData.category;
    const decimalHours = getEffectiveTotalTime();
    
    onAddTask({
      title: formData.title.trim(),
      description: formData.description.trim(),
      deadline: formData.deadline || '',
      estimatedHours: decimalHours,
      category,
      impact: formData.impact,
      status: 'pending',
      priority: formData.impact === 'high',
      importance: formData.impact === 'high',
      deadlineType: formData.deadlineType,
      schedulingPreference: formData.schedulingPreference,
      targetFrequency: formData.targetFrequency,
      maxSessionLength: formData.deadlineType === 'none' ? formData.maxSessionLength : undefined,
      preferredSessionDuration: formData.estimationMode === 'session' ? convertToDecimalHours(formData.sessionDurationHours, formData.sessionDurationMinutes) : undefined,
      isOneTimeTask: formData.isOneTimeTask,
      startDate: formData.startDate || today,
    });
    setShowValidationErrors(false);
    // Reset form
    setFormData({
      title: '',
      description: '',
      deadline: '',
      estimatedHours: '',
      estimatedMinutes: '0',
      category: '',
      customCategory: '',
      impact: '',
      taskType: '',
      deadlineType: 'hard',
      schedulingPreference: 'consistent',
      targetFrequency: 'daily',
      maxSessionLength: 2,
      isOneTimeTask: false,
      startDate: today,
      estimationMode: 'total',
      sessionDurationHours: '',
      sessionDurationMinutes: '30',
    });
    // Hide the form after successful submission
    onCancel?.();
  };

  const handleTimeEstimationUpdate = (hours: string, minutes: string, taskType: string) => {
    setFormData(f => ({ 
      ...f, 
      estimatedHours: hours, 
      estimatedMinutes: minutes,
      taskType: taskType 
    }));
  };

  // Check if current edit form represents a low-priority urgent task
  const isLowPriorityUrgent = useMemo(() => {
    if (!formData.deadline) return false;
    const deadline = new Date(formData.deadline);
    const now = new Date();
    const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDeadline <= 3 && formData.importance === false;
  }, [formData.deadline, formData.importance]);

  return (
    <div className="backdrop-blur-md bg-white/80 dark:bg-black/40 rounded-3xl shadow-2xl shadow-purple-500/10 p-8 border border-white/20 dark:border-white/10 max-w-2xl mx-auto task-input-section relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-violet-400/20 to-purple-500/20 rounded-full blur-xl"></div>
      <div className="relative">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent mb-6 flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Plus className="text-white" size={18} />
          </div>
          <span>Add New Task</span>
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Task Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={e => setFormData(f => ({ ...f, title: e.target.value }))}
              className="w-full px-4 py-3 backdrop-blur-sm bg-white/70 dark:bg-black/20 border border-white/30 dark:border-white/20 rounded-xl text-base focus:ring-2 focus:ring-violet-500 focus:border-transparent dark:text-white transition-all duration-300"
              placeholder="e.g., Write project report"
            />
          </div>

          {/* 2. Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Description <span className="text-gray-400">(Optional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 backdrop-blur-sm bg-white/70 dark:bg-black/20 border border-white/30 dark:border-white/20 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent dark:text-white transition-all duration-300 resize-none"
              placeholder="Add any additional details..."
              rows={2}
            />
          </div>

          {/* 3. Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Category
            </label>
            <select
              value={formData.category}
              onChange={e => setFormData(f => ({ ...f, category: e.target.value, customCategory: '' }))}
              className="w-full border border-white/30 dark:border-white/20 rounded-xl px-3 py-2 text-sm bg-white/70 dark:bg-black/20 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            >
              <option value="">Select category...</option>
              {['Academics', 'Organization', 'Work', 'Personal', 'Health', 'Learning', 'Finance', 'Home', 'Custom...'].map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {showCustomCategory && (
              <div className="relative mt-1">
                <input
                  type="text"
                  value={formData.customCategory}
                  onChange={e => setFormData(f => ({ ...f, customCategory: e.target.value }))}
                  className="w-full border border-white/30 dark:border-white/20 rounded-xl px-3 py-2 pr-9 text-sm bg-white/70 dark:bg-black/20 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  placeholder="Enter custom category"
                />
                {formData.customCategory && (
                  <button
                    type="button"
                    aria-label="Clear custom category"
                    title="Clear"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    onClick={() => setFormData(f => ({ ...f, customCategory: '' }))}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 4. Deadline (with Start Date to the right) */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Deadline
                </label>
                <input
                  type="date"
                  min={today}
                  value={formData.deadline}
                  onChange={e => setFormData(f => ({ ...f, deadline: e.target.value }))}
                  className="w-full px-3 py-2 border border-white/30 dark:border-white/20 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white/70 dark:bg-black/20 dark:text-white"
                  placeholder="Select deadline (optional)"
                />
                {!isDeadlineValid && formData.deadline && (
                  <div className="text-red-600 text-xs mt-1">
                    Deadline cannot be in the past.
                  </div>
                )}
              </div>

              {!formData.isOneTimeTask && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    min={today}
                    value={formData.startDate}
                    onChange={e => setFormData(f => ({ ...f, startDate: e.target.value || today }))}
                    className="w-full px-3 py-2 border border-white/30 dark:border-white/20 rounded-xl text-sm bg-white/70 dark:bg-black/20 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                  {!isStartDateValid && formData.startDate && (
                    <div className="text-red-600 text-xs mt-1">
                      Start date cannot be in the past.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick deadline shortcuts */}
            <div className="flex flex-wrap gap-1 text-xs">
              <button
                type="button"
                className="px-2 py-1 rounded border bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                onClick={() => setFormData(f => ({ ...f, deadline: today }))}
              >
                Today
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded border bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  const iso = d.toISOString().split('T')[0];
                  setFormData(f => ({ ...f, deadline: iso }));
                }}
              >
                Tomorrow
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded border bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  const iso = d.toISOString().split('T')[0];
                  setFormData(f => ({ ...f, deadline: iso }));
                }}
              >
                Next week
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded border bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                onClick={() => setFormData(f => ({ ...f, deadline: '' }))}
              >
                Clear
              </button>
            </div>
          </div>

          {/* 5. One sitting toggle */}
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isOneTimeTask}
                onChange={e => setFormData(f => ({ ...f, isOneTimeTask: e.target.checked }))}
                className="text-violet-600 rounded focus:ring-violet-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">
                Complete this task in one sitting (don't divide into sessions)
              </span>
            </label>
            {formData.isOneTimeTask && (
                <div className="mt-1 space-y-2">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border-l-2 border-blue-300 dark:border-blue-600">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                       One-sitting tasks require a deadline and will be scheduled as single blocks on the deadline day, regardless of importance level.
                    </p>
                  </div>

                  {/* One-sitting task warnings */}
                  {isOneSittingTooLong && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 text-sm">❌</span>
                        <div className="text-xs text-red-700 dark:text-red-200">
                          <div className="font-medium mb-1">Task Duration Too Long</div>
                          <div>This one-sitting task requires {estimatedDecimalHours}h but you only have {userSettings.dailyAvailableHours}h available per day.</div>
                          <div className="mt-2 font-medium">Solutions:</div>
                          <div className="ml-2">
                            • Reduce the estimated time<br/>
                            • Increase daily available hours in settings<br/>
                            • Uncheck "one-sitting" to allow splitting into sessions
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {isOneSittingNoTimeSlot && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 text-sm">📅</span>
                        <div className="text-xs text-red-700 dark:text-red-200">
                          <div className="font-medium mb-1">No Available Time Slot</div>
                          <div>{oneSittingTimeSlotCheck.message}</div>
                          <div className="mt-2 font-medium">Solutions:</div>
                          <div className="ml-2">
                            • Choose a different deadline date<br/>
                            • Reduce the estimated time<br/>
                            • Move or remove conflicting commitments<br/>
                            • Uncheck "one-sitting" to allow flexible scheduling
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </div>

          {/* 6. Frequency */}
          {!formData.isOneTimeTask && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                How often would you like to work on this?
              </label>
              <select
                value={formData.targetFrequency}
                onChange={e => setFormData(f => ({ ...f, targetFrequency: e.target.value as any }))}
                className="w-full px-4 py-3 border border-white/30 dark:border-white/20 rounded-xl text-sm bg-white/70 dark:bg-black/20 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              >
                <option value="daily">🗓️ Daily progress - Work a bit each day</option>
                <option
                  value="3x-week"
                  disabled={frequencyRestrictions.disable3xWeek}
                >
                  📅 Few times per week - Every 2-3 days{frequencyRestrictions.disable3xWeek ? ' (Need 1+ week)' : ''}
                </option>
                <option
                  value="weekly"
                  disabled={frequencyRestrictions.disableWeekly}
                >
                  📆 Weekly sessions - Once per week{frequencyRestrictions.disableWeekly ? ' (Need 2+ weeks)' : ''}
                </option>
                <option value="flexible">⏰ When I have time - Flexible scheduling</option>
              </select>

              {deadlineConflict.hasConflict && (
                <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded text-xs text-amber-700 dark:text-amber-200">
                  <div className="font-medium">Frequency preference may not allow completion before deadline</div>
                  {deadlineConflict.reason && (
                    <div className="mt-1">{deadlineConflict.reason}</div>
                  )}
                  {deadlineConflict.recommendedFrequency && (
                    <div className="mt-1">
                      <strong>Recommended:</strong> Switch to "{deadlineConflict.recommendedFrequency}" frequency, or daily scheduling will be used instead.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 7. Time Estimation */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                Time Estimation <span className="text-red-500">*</span>
              </label>
              {!formData.isOneTimeTask && (
                <div className="flex bg-white/50 dark:bg-black/30 rounded-lg p-1 border border-white/30 dark:border-white/20">
                  <button
                    type="button"
                    onClick={() => setFormData(f => ({ ...f, estimationMode: 'total' }))}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      formData.estimationMode === 'total'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-black/30'
                    }`}
                  >
                    Total Time
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(f => ({ ...f, estimationMode: 'session' }))}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      formData.estimationMode === 'session'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-black/30'
                    }`}
                  >
                    Session-Based
                  </button>
                </div>
              )}
            </div>

            {formData.estimationMode === 'total' ? (
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <div className="flex-1 p-3 border border-white/30 dark:border-white/20 rounded-xl bg-white/70 dark:bg-black/20">
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-medium text-gray-800 dark:text-white">
                        {totalTime > 0 ? formatTimeDisplay(formData.estimatedHours, formData.estimatedMinutes) : 'Not set'}
                      </div>
                      <div className="flex items-center gap-2">
                        {formData.estimatedHours && (
                          <button
                            type="button"
                            aria-label="Clear hours"
                            title="Clear hours"
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            onClick={() => setFormData(f => ({ ...f, estimatedHours: '' }))}
                          >
                            <X size={16} />
                          </button>
                        )}
                        {(formData.estimatedMinutes && formData.estimatedMinutes !== '0') && (
                          <button
                            type="button"
                            aria-label="Clear minutes"
                            title="Clear minutes"
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            onClick={() => setFormData(f => ({ ...f, estimatedMinutes: '0' }))}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    {formData.taskType && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Task type: {formData.taskType}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTimeEstimationModal(true)}
                    className="flex items-center space-x-2 px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors"
                  >
                    <Clock size={18} />
                    <span>Estimate</span>
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowTimeEstimationModal(true)}
                    className="text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    Need help estimating?
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTimePresets(!showTimePresets)}
                    className="text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    {showTimePresets ? 'Hide quick presets' : 'Show quick presets'}
                  </button>
                </div>
                {showTimePresets && (
                  <div className="mt-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Quick presets:</div>
                    <div className="flex flex-wrap gap-1">
                      {timePresets.map((preset, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setFormData(f => ({
                            ...f,
                            estimatedHours: preset.hours,
                            estimatedMinutes: preset.minutes,
                          }))}
                          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white rounded border transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 border border-white/30 dark:border-white/20 rounded-xl bg-white/70 dark:bg-black/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-200">Session Duration</div>
                    <div className="flex items-center gap-2">
                      {formData.sessionDurationHours && (
                        <button
                          type="button"
                          aria-label="Clear session hours"
                          title="Clear session hours"
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          onClick={() => setFormData(f => ({ ...f, sessionDurationHours: '' }))}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={formData.sessionDurationHours}
                        onChange={e => setFormData(f => ({ ...f, sessionDurationHours: e.target.value }))}
                        className="w-16 px-2 py-1 text-sm border border-white/30 dark:border-white/20 rounded bg-white/70 dark:bg-black/20 dark:text-white focus:ring-2 focus:ring-violet-500"
                        placeholder="0"
                        min="0"
                        max="8"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">h</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={formData.sessionDurationMinutes}
                        onChange={e => setFormData(f => ({ ...f, sessionDurationMinutes: e.target.value }))}
                        className="w-16 px-2 py-1 text-sm border border-white/30 dark:border-white/20 rounded bg-white/70 dark:bg-black/20 dark:text-white focus:ring-2 focus:ring-violet-500"
                        placeholder="0"
                        min="0"
                        max="59"
                        step="5"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">m</span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">per session</div>
                  </div>
                  {calculateSessionBasedTotal > 0 && (
                    <div className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 rounded p-2">
                      <div className="font-medium">Calculated total: {formatTimeDisplay(Math.floor(calculateSessionBasedTotal).toString(), Math.round((calculateSessionBasedTotal % 1) * 60).toString())}</div>
                      <div className="text-xs mt-1">
                        Based on {formData.targetFrequency === 'daily' ? 'daily' :
                                formData.targetFrequency === '3x-week' ? '3x per week' :
                                formData.targetFrequency === 'weekly' ? 'weekly' : 'flexible'} frequency until deadline
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowSessionPresets(!showSessionPresets)}
                    className="text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    {showSessionPresets ? 'Hide session presets' : 'Show session presets'}
                  </button>
                </div>
                {showSessionPresets && (
                  <div className="mt-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Common session durations:</div>
                    <div className="flex flex-wrap gap-1">
                      {sessionPresets.map((preset, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setFormData(f => ({
                            ...f,
                            sessionDurationHours: preset.hours,
                            sessionDurationMinutes: preset.minutes,
                          }))}
                          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white rounded border transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {formData.estimationMode === 'session' && (!formData.deadline || formData.deadlineType === 'none') && (
                  <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded text-xs text-yellow-700 dark:text-yellow-200">
                    Session-based estimation requires a deadline to calculate total time.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 8. Task Importance */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Task Importance <span className="text-red-500">*</span>
              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                className="text-gray-400 hover:text-violet-600 transition-colors"
                title="Help & Information"
              >
                <HelpCircle size={14} />
              </button>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 p-2 border border-white/30 dark:border-white/20 rounded-lg hover:bg-white/50 dark:hover:bg-black/30 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="impact"
                  value="high"
                  checked={formData.impact === 'high'}
                  onChange={() => setFormData(f => ({ ...f, impact: 'high' }))}
                  className="text-violet-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-white">Important</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">High priority</div>
                </div>
              </label>
              <label className="flex items-center gap-2 p-2 border border-white/30 dark:border-white/20 rounded-lg hover:bg-white/50 dark:hover:bg-black/30 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="impact"
                  value="low"
                  checked={formData.impact === 'low'}
                  onChange={() => setFormData(f => ({ ...f, impact: 'low' }))}
                  className="text-violet-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-white">Standard</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Normal priority</div>
                </div>
              </label>
            </div>
          </div>

          {/* Advanced Timeline Options - Only show for tasks without deadline */}
          {!formData.deadline && (
          <div>
            <button
              type="button"
              onClick={() => setShowTaskTimeline(!showTaskTimeline)}
              className="flex items-center gap-2 text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 text-sm font-medium transition-colors"
            >
              {showTaskTimeline ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              Advanced Options
            </button>

            {showTaskTimeline && (
              <div className="mt-2 p-3 bg-white/30 dark:bg-black/20 rounded-lg border border-white/20 dark:border-white/10">
                {formData.isOneTimeTask && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                      📅 <strong>One-sitting tasks are always scheduled on the deadline day</strong> regardless of importance level.
                    </div>
                  </div>
                )}

                {/* Maximum Session Length (only for no-deadline tasks) */}
                {formData.deadlineType === 'none' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Maximum session length
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={formData.maxSessionLength}
                        onChange={e => setFormData(f => ({ ...f, maxSessionLength: Math.max(0.5, Math.min(8, parseFloat(e.target.value) || 2)) }))}
                        min="0.5"
                        max="8"
                        step="0.5"
                        className="w-20 px-3 py-2 border border-white/30 dark:border-white/20 rounded-xl text-sm bg-white/70 dark:bg-black/20 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200">hours</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Maximum length for each study session (0.5-8 hours)
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Validation Feedback */}
          {!isFormValid && showValidationErrors && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2 dark:bg-red-900/20 dark:border-red-700">
              <div className="text-red-800 dark:text-red-200 font-medium mb-2">Please fill in the required fields:</div>
              <ul className="text-red-700 dark:text-red-300 text-sm space-y-1">
                {getValidationErrors().map((error, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Low-priority urgent warning */}
          {isLowPriorityUrgent && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2 dark:bg-yellow-900/20 dark:border-yellow-700">
              <div className="text-yellow-800 dark:text-yellow-200 font-medium mb-1">Warning: low priority with urgent deadline</div>
              <div className="text-yellow-700 dark:text-yellow-300 text-sm">
                This task is low priority but has an urgent deadline. It may not be scheduled if you have more important urgent tasks.
              </div>
            </div>
          )}

          {/* Validation Warnings */}
          {getValidationWarnings().length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2 dark:bg-yellow-900/20 dark:border-yellow-700">
              <div className="text-yellow-800 dark:text-yellow-200 font-medium mb-2">⚠️ Warnings:</div>
              <ul className="text-yellow-700 dark:text-yellow-300 text-sm space-y-1">
                {getValidationWarnings().map((warning, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-yellow-500 mt-0.5">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              type="submit"
              disabled={!isFormValid}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold text-white transition-all duration-300 ${
                isFormValid
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg hover:shadow-xl'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              Add Task
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Time Estimation Modal */}
        <TimeEstimationModal
          isOpen={showTimeEstimationModal}
          onClose={() => setShowTimeEstimationModal(false)}
          taskType={formData.taskType}
          category={formData.category}
          initialHours={formData.estimatedHours}
          initialMinutes={formData.estimatedMinutes}
          deadline={formData.deadline}
          onEstimateUpdate={handleTimeEstimationUpdate}
        />
      </div>
    </div>
  );
};

export default TaskInputSimplified;
