
import React from 'react';
import type { Task, CallSession } from '../types';
import Icon from './Icon';


const toLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const projectColors = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f97316', '#eab308',
];

const getProjectColor = (projectId: string) => {
    if (!projectId) return projectColors[0];
    let hash = 0;
    for (let i = 0; i < projectId.length; i++) {
        hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % projectColors.length);
    return projectColors[index];
};

interface WeekViewProps {
    currentDate: Date;
    tasks: Task[];
    calls?: CallSession[];
    onTaskDateChange: (taskId: string, newDate: string) => void;
    onMeetingDateChange?: (callId: string, newDate: string) => void;
    onDayClick?: (date: string) => void;
    onTaskClick: (task: Task) => void;
    onMeetingClick?: (call: CallSession) => void;
    language: string;
}

const WeekView: React.FC<WeekViewProps> = ({ currentDate, tasks, calls = [], onTaskDateChange, onMeetingDateChange, onDayClick, onTaskClick, onMeetingClick, language }) => {
    
    const getWeekDays = (date: Date): Date[] => {
        const startOfWeek = new Date(date);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); 
        startOfWeek.setDate(diff);

        return Array.from({ length: 7 }, (_, i) => {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            return day;
        });
    };

    const weekDays = getWeekDays(currentDate);
    const todayString = new Date().toDateString();

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string, type: 'task' | 'meeting') => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("itemId", id);
        e.dataTransfer.setData("itemType", type);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.classList.add('bg-brand-primary/5');
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.currentTarget.classList.remove('bg-brand-primary/5');
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, newDate: string) => {
        e.preventDefault();
        e.currentTarget.classList.remove('bg-brand-primary/5');
        const itemId = e.dataTransfer.getData("itemId");
        const itemType = e.dataTransfer.getData("itemType");
        if (itemType === "task" && itemId) {
            onTaskDateChange(itemId, newDate);
        } else if (itemType === "meeting" && itemId && onMeetingDateChange) {
            onMeetingDateChange(itemId, newDate);
        }
    };

    return (
        <div className="flex-1 grid grid-cols-7 gap-2 p-2 sm:p-0 h-full overflow-hidden">
            {weekDays.map(date => {
                const dateString = toLocalDateString(date);
                const isToday = date.toDateString() === todayString;
                const tasksForDay = tasks.filter(t => t.date === dateString);
                const callsForDay = calls.filter(c => c.scheduledAt?.startsWith(dateString));

                return (
                    <div
                        key={dateString}
                        className={`rounded-lg flex flex-col transition-all duration-300 relative overflow-hidden bg-light-surface/50 dark:bg-dark-surface/50 min-h-0 ${isToday ? 'border-2 border-brand-primary' : 'border border-light-border/50 dark:border-dark-border/50'}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, dateString)}
                    >
                        <div className={`p-2 border-b border-light-border/50 dark:border-dark-border/50 text-center flex-none ${isToday ? 'bg-brand-primary/10' : ''}`}>
                            <p className="text-[10px] font-semibold text-light-text-secondary dark:text-dark-text-secondary uppercase">
                                {new Intl.DateTimeFormat(language, { weekday: 'short' }).format(date)}
                            </p>
                            <p className={`text-lg font-black ${isToday ? 'text-brand-primary' : ''}`}>{date.getDate()}</p>
                        </div>
                        <div className="p-2 flex-1 space-y-1.5 overflow-y-auto custom-scrollbar" onClick={() => onDayClick?.(dateString)}>
                            {callsForDay.map(call => (
                                <div
                                    key={call.id}
                                    draggable={true}
                                    onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, call.id, 'meeting'); }}
                                    onClick={(e) => { e.stopPropagation(); onMeetingClick?.(call); }}
                                    className="p-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] rounded-md cursor-pointer hover:opacity-80 transition-opacity shadow-sm border-l-4 border-purple-500 font-bold"
                                    title={`Reunión: ${call.title}`}
                                >
                                    <div className="flex items-center gap-1">
                                        <Icon name="video" className="w-3 h-3" />
                                        <span className="truncate">{call.scheduledAt?.split('T')[1]?.slice(0, 5)}</span>
                                    </div>
                                    <p className="truncate mt-0.5">{call.title}</p>
                                </div>
                            ))}
                            
                            {tasksForDay.map(task => (
                                <div
                                    key={task.id}
                                    draggable
                                    onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, task.id, 'task'); }}
                                    onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                                    className="p-1.5 text-white text-[10px] rounded-md cursor-pointer hover:opacity-80 transition-opacity shadow-sm"
                                    style={{ backgroundColor: getProjectColor(task.projectId) }}
                                    title={task.title}
                                >
                                    <p className="font-semibold truncate">{task.title}</p>
                                    {task.time && <p className="text-[8px] opacity-80 mt-0.5">{task.time}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default WeekView;
