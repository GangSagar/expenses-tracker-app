import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { generateDaysInMonth } from '../utils/dateHelpers';

interface CalendarModalProps {
  startDate: number | null;
  endDate: number | null;
  onClose: () => void;
  onApply: (start: number | null, end: number | null) => void;
}

export default function CalendarModal({ startDate, endDate, onClose, onApply }: CalendarModalProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const start = startDate ? new Date(startDate) : new Date();
    return new Date(start.getFullYear(), start.getMonth(), 1);
  });

  const [tempStart, setTempStart] = useState<number | null>(startDate);
  const [tempEnd, setTempEnd] = useState<number | null>(endDate);

  const days = useMemo(() => generateDaysInMonth(currentMonth), [currentMonth]);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleDayPress = (dateObj: Date) => {
    const dayTs = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(dayTs);
      setTempEnd(null);
    } else if (tempStart && !tempEnd) {
      if (dayTs < tempStart) {
        setTempStart(dayTs);
      } else {
        setTempEnd(dayTs);
      }
    }
  };

  const handleClear = () => {
    setTempStart(null);
    setTempEnd(null);
  };

  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const monthYearLabel = currentMonth.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.calendarBox}>
        {/* Header */}
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn}>
            <Text style={styles.navBtnText}>◀</Text>
          </TouchableOpacity>
          <Text style={styles.monthYearText}>{monthYearLabel}</Text>
          <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn}>
            <Text style={styles.navBtnText}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* Weekdays */}
        <View style={styles.weekdaysRow}>
          {weekdays.map(d => (
            <Text key={d} style={styles.weekdayLabel}>{d}</Text>
          ))}
        </View>

        {/* Days Grid */}
        <View style={styles.daysGrid}>
          {days.map((d, index) => {
            const dayTs = d.dateObj.getTime();
            const isToday = new Date().toDateString() === d.dateObj.toDateString();
            
            let isSelected = false;
            let isInRange = false;

            if (tempStart && tempStart === dayTs) {
              isSelected = true;
            } else if (tempEnd && tempEnd === dayTs) {
              isSelected = true;
            } else if (tempStart && tempEnd && dayTs > tempStart && dayTs < tempEnd) {
              isInRange = true;
            }

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  !d.isCurrentMonth && styles.dayCellOutside,
                  isInRange && styles.dayCellInRange,
                  isSelected && styles.dayCellSelected,
                ]}
                onPress={() => handleDayPress(d.dateObj)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.dayText,
                    !d.isCurrentMonth && styles.dayTextOutside,
                    isInRange && styles.dayTextInRange,
                    isSelected && styles.dayTextSelected,
                    isToday && !isSelected && styles.dayTextToday,
                  ]}
                >
                  {d.dateObj.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Range Preview */}
        <View style={styles.rangePreviewBox}>
          <Text style={styles.rangePreviewText}>
            {tempStart ? (
              <>
                Selected: <Text style={styles.rangeHighlight}>{new Date(tempStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                {tempEnd ? (
                  <>
                    {'  ➔  '}
                    <Text style={styles.rangeHighlight}>{new Date(tempEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                  </>
                ) : (
                  ' (Select End Date)'
                )}
              </>
            ) : (
              'Tap start & end dates'
            )}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.calendarActions}>
          <TouchableOpacity onPress={handleClear} style={styles.calendarClearBtn}>
            <Text style={styles.calendarClearText}>Clear Selection</Text>
          </TouchableOpacity>
          <View style={styles.calendarRightActions}>
            <TouchableOpacity onPress={onClose} style={styles.calendarCancelBtn}>
              <Text style={styles.calendarCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onApply(tempStart, tempEnd)} style={styles.calendarApplyBtn}>
              <Text style={styles.calendarApplyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 360,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navBtn: {
    padding: 8,
  },
  navBtnText: {
    fontSize: 14,
    color: '#1a73e8',
    fontWeight: '700',
  },
  monthYearText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202124',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayLabel: {
    width: 40,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#5f6368',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dayCell: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    borderRadius: 20,
  },
  dayCellOutside: {
    opacity: 0.3,
  },
  dayCellInRange: {
    backgroundColor: '#e8f0fe',
    borderRadius: 0,
  },
  dayCellSelected: {
    backgroundColor: '#1a73e8',
  },
  dayText: {
    fontSize: 13,
    color: '#202124',
    fontWeight: '500',
  },
  dayTextOutside: {
    color: '#9aa0a6',
  },
  dayTextInRange: {
    color: '#1a73e8',
    fontWeight: '700',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  dayTextToday: {
    color: '#1a73e8',
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 20,
    width: 28,
    height: 28,
    textAlign: 'center',
    lineHeight: 26,
  },
  rangePreviewBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginVertical: 12,
  },
  rangePreviewText: {
    fontSize: 12,
    color: '#5f6368',
    fontWeight: '600',
  },
  rangeHighlight: {
    color: '#1a73e8',
    fontWeight: '700',
  },
  calendarActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    paddingTop: 12,
    marginTop: 8,
  },
  calendarClearBtn: {
    paddingVertical: 6,
  },
  calendarClearText: {
    fontSize: 12,
    color: '#c5221f',
    fontWeight: '600',
  },
  calendarRightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  calendarCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  calendarCancelText: {
    fontSize: 12,
    color: '#5f6368',
    fontWeight: '600',
  },
  calendarApplyBtn: {
    backgroundColor: '#1a73e8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  calendarApplyText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '700',
  },
});
