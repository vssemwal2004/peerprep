import React, { useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import { Calendar, Clock } from "lucide-react";

/**
 * Cross-browser DateTimePicker component using Flatpickr
 * @param {string} value - ISO datetime string (YYYY-MM-DDTHH:mm)
 * @param {function} onChange - Callback with ISO datetime string
 * @param {string} min - Minimum datetime (ISO format)
 * @param {string} max - Maximum datetime (ISO format)
 * @param {string} placeholder - Input placeholder
 * @param {string} className - Additional CSS classes
 * @param {boolean} disabled - Disable input
 * @param {boolean} enableTime - Enable time picker (default: true)
 */
export default function DateTimePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Select date and time",
  className = "",
  disabled = false,
  enableTime = true,
  isEnd = false,
}) {
  const inputRef = useRef(null);
  const flatpickrRef = useRef(null);
  const lastSelectedDateRef = useRef(null);
  const lastInsideClickRef = useRef(false);
  const okButtonClickedRef = useRef(false);
  const isCalendarOpenRef = useRef(false);

  useEffect(() => {
    if (!inputRef.current) return;
    
    // Don't recreate if instance exists and is open
    if (flatpickrRef.current && isCalendarOpenRef.current) {
      return;
    }

    const options = {
      enableTime,
      dateFormat: enableTime ? "Y-m-d H:i" : "Y-m-d",
      time_24hr: false,
      closeOnSelect: false,
      minuteIncrement: 1,
      defaultDate: value || null,
      minDate: min || null,
      maxDate: max || null,
      // Keep calendar open unless OK button was clicked
      onClose: (selectedDates, dateStr, instance) => {
        try {
          if (!okButtonClickedRef.current) {
            // Reopen immediately if OK button wasn't clicked
            setTimeout(() => {
              if (instance && typeof instance.open === "function") {
                instance.open();
                isCalendarOpenRef.current = true;
              }
            }, 0);
          } else {
            // Reset flag after closing
            okButtonClickedRef.current = false;
            isCalendarOpenRef.current = false;
          }
        } catch {}
      },
      onOpen: (selectedDates, dateStr, instance) => {
        isCalendarOpenRef.current = true;
        // If no selection yet, just jump calendar view to today without selecting
        if (!instance.selectedDates || instance.selectedDates.length === 0) {
          // Try to restore the last selected date if available
          if (lastSelectedDateRef.current) {
            instance.setDate(
              new Date(lastSelectedDateRef.current.getTime()),
              false
            );
          } else if (value) {
            const vd = new Date(value);
            if (!isNaN(vd.getTime())) instance.setDate(vd, false);
            else instance.jumpToDate(new Date());
          } else {
            instance.jumpToDate(new Date());
          }
        }
      },
      onChange: (selectedDates, dateStr, instance) => {
        if (selectedDates.length > 0) {
          const date = selectedDates[0];
          // Remember last selected date (with current time)
          lastSelectedDateRef.current = new Date(date.getTime());
          // Determine if only date was selected (default midnight)
          const isDateOnlyPick =
            date.getHours() === 0 && date.getMinutes() === 0;

          // Default time behavior
          if (isDateOnlyPick) {
            const picked = new Date(date);
            const now = new Date();
            const sameDayAsNow =
              picked.getFullYear() === now.getFullYear() &&
              picked.getMonth() === now.getMonth() &&
              picked.getDate() === now.getDate();
            // Respect event min/max boundaries for defaulting
            const parseDateStr = (s) => {
              if (!s) return null;
              const d = new Date(s);
              return isNaN(d.getTime()) ? null : d;
            };
            const minDateTime = parseDateStr(min);
            const maxDateTime = parseDateStr(max);
            const sameAsMinDay = !!(
              minDateTime &&
              picked.getFullYear() === minDateTime.getFullYear() &&
              picked.getMonth() === minDateTime.getMonth() &&
              picked.getDate() === minDateTime.getDate()
            );
            const sameAsMaxDay = !!(
              maxDateTime &&
              picked.getFullYear() === maxDateTime.getFullYear() &&
              picked.getMonth() === maxDateTime.getMonth() &&
              picked.getDate() === maxDateTime.getDate()
            );

            // If this picker is used for end-time, set 22:00 by default for picked day
            if (isEnd) {
              // End time default 22:00 of picked day
              picked.setHours(22, 0, 0, 0);
              // If max boundary is earlier within the day, cap to it
              if (
                sameAsMaxDay &&
                maxDateTime &&
                picked.getTime() > maxDateTime.getTime()
              ) {
                picked.setHours(
                  maxDateTime.getHours(),
                  maxDateTime.getMinutes(),
                  0,
                  0
                );
              }
              instance.setDate(picked, true);
              try {
                if (instance.updateTimeDisabledStates)
                  instance.updateTimeDisabledStates();
              } catch {}
              return;
            }

            // Start time default: 10:00 or current time if after 10:00, capped at 22:00:00
            if (sameDayAsNow) {
              const currentH = now.getHours();
              if (currentH < 10) picked.setHours(10, 0, 0, 0);
              else if (
                currentH > 22 ||
                (currentH === 22 && now.getMinutes() > 0)
              )
                picked.setHours(22, 0, 0, 0);
              else picked.setHours(currentH, now.getMinutes(), 0, 0);
            } else {
              picked.setHours(10, 0, 0, 0);
            }
            // If selected date is the min boundary day, ensure default is not before event start
            if (sameAsMinDay && minDateTime) {
              if (picked.getTime() < minDateTime.getTime()) {
                picked.setHours(
                  minDateTime.getHours(),
                  minDateTime.getMinutes(),
                  0,
                  0
                );
              }
            }
            // If selected date is the max boundary day, ensure default is not after event end
            if (sameAsMaxDay && maxDateTime) {
              if (picked.getTime() > maxDateTime.getTime()) {
                picked.setHours(
                  maxDateTime.getHours(),
                  maxDateTime.getMinutes(),
                  0,
                  0
                );
              }
            }
            instance.setDate(picked, true);
            try {
              if (instance.updateTimeDisabledStates)
                instance.updateTimeDisabledStates();
            } catch {}
            return;
          }

          // Enforce allowed hours window (10:00 - 22:00, minutes past 00 not allowed at 22:00)
          const now = new Date();
          const hour = date.getHours();
          if (
            hour < 10 ||
            hour > 22 ||
            (hour === 22 && date.getMinutes() > 0)
          ) {
            // Auto-adjust to nearest valid hour inside window
            const adjusted = new Date(date.getTime());
            if (hour < 10) adjusted.setHours(10, 0, 0, 0);
            else adjusted.setHours(22, 0, 0, 0);
            instance.setDate(adjusted, true);
            try {
              if (instance.updateTimeDisabledStates)
                instance.updateTimeDisabledStates();
            } catch {}
            return;
          }
          // For start picker (no min), prevent picking past
          if (!min && date.getTime() <= now.getTime()) {
            // Move to next allowable future minute within window
            const future = new Date(now.getTime() + 60 * 1000);
            if (future.getHours() < 10) future.setHours(10, 0, 0, 0);
            if (
              future.getHours() > 22 ||
              (future.getHours() === 22 && future.getMinutes() > 0)
            ) {
              // move to next day 10:00
              future.setDate(future.getDate() + 1);
              future.setHours(10, 0, 0, 0);
            }
            instance.setDate(future, true);
            try {
              if (instance.updateTimeDisabledStates)
                instance.updateTimeDisabledStates();
            } catch {}
            return;
          }
          // Convert to ISO format (YYYY-MM-DDTHH:mm)
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          const hours = String(date.getHours()).padStart(2, "0");
          const minutes = String(date.getMinutes()).padStart(2, "0");

          const isoString = enableTime
            ? `${year}-${month}-${day}T${hours}:${minutes}`
            : `${year}-${month}-${day}`;

          // Avoid redundant parent updates when value hasn't changed
          if (!value || value !== isoString) {
            onChange(isoString);
          }
          // Update stored last selected date again after potential external updates
          try {
            lastSelectedDateRef.current = new Date(date.getTime());
          } catch {}
          // Refresh hour/minute disabled states if helper present
          try {
            if (instance && instance.updateTimeDisabledStates) {
              instance.updateTimeDisabledStates();
            }
          } catch {}
        }
      },
      onReady: (selectedDates, dateStr, instance) => {
        // Track inside vs outside clicks to guard closing
        try {
          const onDocMouseDown = (e) => {
            const container = instance.calendarContainer;
            lastInsideClickRef.current = !!(
              container && container.contains(e.target)
            );
          };
          document.addEventListener("mousedown", onDocMouseDown, true);
          // Store for cleanup
          instance.__onDocMouseDown = onDocMouseDown;
        } catch {}
        // Add custom styling to the calendar - check if container exists
        if (instance.calendarContainer) {
          instance.calendarContainer.classList.add("flatpickr-custom");

          // Increase calendar width
          instance.calendarContainer.style.width = "auto";

          // Add OK button to the calendar header (top right corner)
          const monthsContainer = instance.monthNav;
          if (monthsContainer) {
            // Make months container relative for absolute positioning
            monthsContainer.style.position = "relative";
            monthsContainer.style.display = "flex";
            monthsContainer.style.alignItems = "center";
            monthsContainer.style.justifyContent = "center";
            
            // Create OK button
            const okButton = document.createElement("button");
            okButton.textContent = "OK";
            okButton.type = "button";
            okButton.className = "flatpickr-ok-button";
            okButton.style.cssText =
              "position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 4px 12px; background: white; color: #0ea5e9; border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); z-index: 10;";
            
            // Add hover effect
            okButton.addEventListener("mouseenter", () => {
              okButton.style.background = "rgba(255, 255, 255, 0.95)";
              okButton.style.borderColor = "rgba(255, 255, 255, 0.5)";
              okButton.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.15)";
            });
            okButton.addEventListener("mouseleave", () => {
              okButton.style.background = "white";
              okButton.style.borderColor = "rgba(255, 255, 255, 0.3)";
              okButton.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.1)";
            });
            
            // OK button click handler
            okButton.addEventListener("click", () => {
              // Set the flag to allow closing via OK button
              okButtonClickedRef.current = true;
              // Close the calendar
              if (instance && typeof instance.close === "function") {
                instance.close();
              }
            });
            
            monthsContainer.appendChild(okButton);
            
            // Add Enter key listener to trigger OK button
            const handleKeyDown = (e) => {
              if (e.key === "Enter" && instance.isOpen) {
                e.preventDefault();
                okButton.click();
              }
            };
            document.addEventListener("keydown", handleKeyDown);
            // Store for cleanup
            instance.__handleKeyDown = handleKeyDown;
            instance.__okButton = okButton;
          }

          // Restructure DOM to place time picker beside calendar
          if (enableTime && instance.timeContainer) {
            const timeContainer = instance.timeContainer;
            const innerContainer = instance.innerContainer;

            // Apply inline styles to override Flatpickr defaults
            Object.assign(timeContainer.style, {
              display: "flex",
              flexDirection: "column",
              gap: "0px",
              position: "static",
              width: "200px",
              minWidth: "200px",
              height: "100%",
              minHeight: "280px",
              padding: "0",
              paddingTop: "0",
              marginTop: "0",
              background: "transparent",
              border: "none",
              borderLeft: "1px solid #e2e8f0",
              margin: "0",
              visibility: "visible",
              opacity: "1",
              boxSizing: "border-box",
            });

            // Apply inline styles to innerContainer
            Object.assign(innerContainer.style, {
              display: "flex",
              flexDirection: "row",
              alignItems: "stretch",
              gap: "0",
            });

            // Set calendar width to proper size
            if (instance.rContainer) {
              instance.rContainer.style.width = "308px";
            }
            if (instance.days) {
              instance.days.style.width = "308px";
            }

            // Move time container inside innerContainer
            if (timeContainer.parentElement !== innerContainer) {
              innerContainer.appendChild(timeContainer);
            }

            // Get the weekdays element to match its styling
            const weekdaysElement = instance.weekdayContainer;
            let weekdayHeight = "28px";
            let weekdayPadding = "0";

            if (weekdaysElement) {
              const computedStyle = window.getComputedStyle(weekdaysElement);
              weekdayHeight = computedStyle.height;
              weekdayPadding = computedStyle.padding;
            }

            // Rearrange time picker elements in columns
            const hourInput = timeContainer.querySelector(".flatpickr-hour");
            const minuteInput =
              timeContainer.querySelector(".flatpickr-minute");
            const amPm = timeContainer.querySelector(".flatpickr-am-pm");
            const separator = timeContainer.querySelector(
              ".flatpickr-time-separator"
            );

            if (separator) {
              separator.style.display = "none";
            }

            if (hourInput && minuteInput && amPm) {
              // Clear and rebuild
              timeContainer.innerHTML = "";

              // Add "Select Time" heading - matching exact weekday row height and padding
              const heading = document.createElement("div");
              heading.textContent = "Select Time";
              heading.className = "time-heading";
              heading.style.cssText = `width: 100%; text-align: center; font-size: 13px; font-weight: 600; color: #0ea5e9; height: ${weekdayHeight}; padding: ${weekdayPadding}; display: flex; align-items: center; justify-content: center; background: transparent; border-bottom: 1px solid #e2e8f0; box-sizing: border-box;`;
              timeContainer.appendChild(heading);

              // Create column labels container
              const labelsContainer = document.createElement("div");
              labelsContainer.className = "time-labels-container";
              labelsContainer.style.cssText =
                "display: flex; gap: 8px; height: 28px; padding: 0 16px; align-items: center; border-bottom: 1px solid #e2e8f0;";

              const hourLabel = document.createElement("div");
              hourLabel.textContent = "Hour";
              hourLabel.className = "time-label";
              hourLabel.style.cssText =
                "width: 50px; font-size: 11px; font-weight: 600; color: #64748b; text-align: center;";
              labelsContainer.appendChild(hourLabel);

              const minuteLabel = document.createElement("div");
              minuteLabel.textContent = "Minute";
              minuteLabel.className = "time-label";
              minuteLabel.style.cssText =
                "width: 50px; font-size: 11px; font-weight: 600; color: #64748b; text-align: center;";
              labelsContainer.appendChild(minuteLabel);

              const periodLabel = document.createElement("div");
              periodLabel.textContent = "Period";
              periodLabel.className = "time-label";
              periodLabel.style.cssText =
                "width: 50px; font-size: 11px; font-weight: 600; color: #64748b; text-align: center;";
              labelsContainer.appendChild(periodLabel);

              timeContainer.appendChild(labelsContainer);

              // Create columns container
              const columnsContainer = document.createElement("div");
              columnsContainer.style.cssText =
                "display: flex; gap: 8px; align-items: flex-start; padding: 10px 16px; justify-content: center;";

              // Hour column with all options (1-12)
              const hourColumn = document.createElement("div");
              hourColumn.style.cssText =
                "display: flex; flex-direction: column; align-items: center;";

              const hourScroller = document.createElement("div");
              hourScroller.className = "time-scroller hour-scroller";
              hourScroller.style.cssText =
                "width: 50px; height: 168px; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; border: 1px solid #e2e8f0; border-radius: 8px; background: #fafafa; position: relative;";

              // Generate hours 1-12
              for (let i = 1; i <= 12; i++) {
                const hourOption = document.createElement("div");
                hourOption.textContent = i.toString().padStart(2, "0");
                hourOption.className = "time-option";
                hourOption.style.cssText =
                  "height: 36px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 500; color: #475569; cursor: pointer; transition: all 0.2s;";
                hourOption.addEventListener("click", () => {
                  // Visual highlight within hour column
                  Array.from(hourScroller.children).forEach((opt) => {
                    opt.style.background = "transparent";
                    opt.style.color = "#475569";
                    opt.style.fontWeight = "500";
                  });
                  hourOption.style.background = "#0ea5e9";
                  hourOption.style.color = "#ffffff";
                  hourOption.style.fontWeight = "600";
                  // Sync hidden input and apply via Flatpickr API
                  hourInput.value = i;
                  const period = (amPm.value || "AM").toUpperCase();
                  const minute = parseInt(minuteInput.value || "0", 10);
                  if (typeof applyTime === "function")
                    applyTime(i, minute, period);
                });
                hourScroller.appendChild(hourOption);
              }
              hourScroller.style.scrollbarWidth = "none";
              hourScroller.style.msOverflowStyle = "none";
              const hourStyle = document.createElement("style");
              hourStyle.textContent =
                ".time-scroller::-webkit-scrollbar { display: none; }";
              document.head.appendChild(hourStyle);

              hourColumn.appendChild(hourScroller);
              columnsContainer.appendChild(hourColumn);

              // Minute column with all options (00-59)
              const minuteColumn = document.createElement("div");
              minuteColumn.style.cssText =
                "display: flex; flex-direction: column; align-items: center;";

              const minuteScroller = document.createElement("div");
              minuteScroller.className = "time-scroller minute-scroller";
              minuteScroller.style.cssText =
                "width: 50px; height: 168px; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; border: 1px solid #e2e8f0; border-radius: 8px; background: #fafafa; position: relative;";

              // Generate minutes 00-59
              for (let i = 0; i <= 59; i++) {
                const minuteOption = document.createElement("div");
                minuteOption.textContent = i.toString().padStart(2, "0");
                minuteOption.className = "time-option";
                minuteOption.style.cssText =
                  "height: 36px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 500; color: #475569; cursor: pointer; transition: all 0.2s;";
                minuteOption.addEventListener("click", () => {
                  // Visual highlight within minute column
                  Array.from(minuteScroller.children).forEach((opt) => {
                    opt.style.background = "transparent";
                    opt.style.color = "#475569";
                    opt.style.fontWeight = "500";
                  });
                  minuteOption.style.background = "#0ea5e9";
                  minuteOption.style.color = "#ffffff";
                  minuteOption.style.fontWeight = "600";
                  // Sync hidden input and apply via Flatpickr API
                  minuteInput.value = i;
                  const h12 = parseInt(hourInput.value || "12", 10);
                  const period = (amPm.value || "AM").toUpperCase();
                  if (typeof applyTime === "function")
                    applyTime(h12, i, period);
                });
                minuteScroller.appendChild(minuteOption);
              }

              minuteColumn.appendChild(minuteScroller);
              columnsContainer.appendChild(minuteColumn);

              // AM/PM column (always show both options)
              const amPmColumn = document.createElement("div");
              amPmColumn.style.cssText =
                "display: flex; flex-direction: column; align-items: center;";

              // Keep original amPm input hidden to sync with Flatpickr
              amPm.style.display = "none";
              amPmColumn.appendChild(amPm);

              const ampmBox = document.createElement("div");
              ampmBox.className = "ampm-box";
              ampmBox.style.cssText =
                "width: 50px; height: 168px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fafafa; display: flex; flex-direction: column; overflow: hidden;";
              const amOption = document.createElement("div");
              amOption.textContent = "AM";
              amOption.className = "ampm-option";
              amOption.style.cssText =
                "flex: 1; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:600; color:#475569; cursor:pointer;";
              const pmOption = document.createElement("div");
              pmOption.textContent = "PM";
              pmOption.className = "ampm-option";
              pmOption.style.cssText =
                "flex: 1; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:600; color:#475569; cursor:pointer; border-top:1px solid #e2e8f0;";
              ampmBox.appendChild(amOption);
              ampmBox.appendChild(pmOption);
              amPmColumn.appendChild(ampmBox);
              columnsContainer.appendChild(amPmColumn);

              timeContainer.appendChild(columnsContainer);

              // Hide original inputs
              hourInput.style.display = "none";
              minuteInput.style.display = "none";

              // Helpers: selected/disabled styling
              const setActive = (el, active) => {
                if (!el) return;
                el.style.background = active ? "#0ea5e9" : "transparent";
                el.style.color = active ? "#ffffff" : "#475569";
              };
              // Hide/show a time option (hour/minute)
              const setHiddenOption = (el, hidden) => {
                if (!el) return;
                el.style.display = hidden ? "none" : "flex";
                if (!hidden) {
                  el.style.color = "#475569";
                }
              };
              // Disable/enable AM or PM (do not hide)
              const setAmPmDisabled = (el, disabled) => {
                if (!el) return;
                el.classList.toggle("disabled", !!disabled);
                el.style.pointerEvents = disabled ? "none" : "auto";
                el.style.opacity = "1";
              };

              // Click handlers should also re-evaluate minute disables
              hourScroller
                .querySelectorAll(".time-option")
                .forEach((opt, idx) => {
                  opt.addEventListener("click", () => {
                    updateDisabledStates(idx + 1);
                  });
                });

              // Build arrays for update function
              const hourOptions = Array.from(hourScroller.children);
              const minuteOptions = Array.from(minuteScroller.children);

              // Helpers to apply time via Flatpickr API
              const hasSelectedDate = () =>
                !!(instance.selectedDates && instance.selectedDates[0]);
              const getBaseDate = () => {
                if (hasSelectedDate())
                  return new Date(instance.selectedDates[0].getTime());
                if (lastSelectedDateRef.current)
                  return new Date(lastSelectedDateRef.current.getTime());
                if (value) {
                  const d = new Date(value);
                  if (!isNaN(d.getTime())) return d;
                }
                return null;
              };
              const to24h = (h12, period) => {
                let h = h12 % 12;
                if (period === "PM") h += 12;
                return h;
              };
              const applyTime = (h12, m, period) => {
                const base = getBaseDate();
                if (!base) return; // No prior date to apply time to
                const h24 = to24h(h12, (period || "AM").toUpperCase());
                base.setHours(h24, m || 0, 0, 0);
                instance.setDate(base, true);
              };
              // AM/PM selection handlers (apply via setDate)
              const selectPeriod = (period) => {
                const currentPeriod = (amPm.value || "AM").toUpperCase();
                // Update visuals regardless
                amPm.value = period;
                setActive(amOption, period === "AM");
                setActive(pmOption, period === "PM");
                amOption.classList.toggle("active", period === "AM");
                pmOption.classList.toggle("active", period === "PM");
                // Avoid re-applying the same period to prevent recursion
                if (currentPeriod === period) return;
                const currentHour = parseInt(hourInput.value || "12", 10);
                const currentMinute = parseInt(minuteInput.value || "0", 10);
                applyTime(currentHour, currentMinute, period);
              };
              amOption.addEventListener("click", () => selectPeriod("AM"));
              pmOption.addEventListener("click", () => selectPeriod("PM"));

              const getCurrent12h = () => {
                const now = new Date();
                const h24 = now.getHours();
                const period = h24 >= 12 ? "PM" : "AM";
                let h12 = h24 % 12;
                if (h12 === 0) h12 = 12;
                return { h12, period, minute: now.getMinutes(), date: now };
              };
              const parseDateStr = (s) => {
                if (!s) return null;
                const d = new Date(s);
                return isNaN(d.getTime()) ? null : d;
              };
              const minDateTime = parseDateStr(min);
              const maxDateTime = parseDateStr(max);
              const isTodaySelected = () => {
                const d = instance.selectedDates && instance.selectedDates[0];
                if (!d) return false;
                const n = new Date();
                return (
                  d.getFullYear() === n.getFullYear() &&
                  d.getMonth() === n.getMonth() &&
                  d.getDate() === n.getDate()
                );
              };
              const isMinDaySelected = () => {
                const d = instance.selectedDates && instance.selectedDates[0];
                if (!d || !minDateTime) return false;
                return (
                  d.getFullYear() === minDateTime.getFullYear() &&
                  d.getMonth() === minDateTime.getMonth() &&
                  d.getDate() === minDateTime.getDate()
                );
              };
              const isMaxDaySelected = () => {
                const d = instance.selectedDates && instance.selectedDates[0];
                if (!d || !maxDateTime) return false;
                return (
                  d.getFullYear() === maxDateTime.getFullYear() &&
                  d.getMonth() === maxDateTime.getMonth() &&
                  d.getDate() === maxDateTime.getDate()
                );
              };
              const comparePeriod = (a, b) =>
                a === b ? 0 : a === "AM" ? -1 : 1;
              const isHourAllowedByWindow = (period, h12) => {
                if (period === "AM") return h12 >= 10 && h12 <= 11; // 10am, 11am
                // PM: 12(noon) to 10pm inclusive; 11pm not allowed
                return h12 === 12 || (h12 >= 1 && h12 <= 10);
              };

              const updateDisabledStates = () => {
                const today = isTodaySelected();
                const nowInfo = getCurrent12h();
                const selPeriod = (amPm.value || "AM").toUpperCase();
                const selHour = parseInt(hourInput.value || "12", 10);
                const minDay = isMinDaySelected();
                const maxDay = isMaxDaySelected();
                const refPeriod =
                  minDay && minDateTime
                    ? minDateTime.getHours() >= 12
                      ? "PM"
                      : "AM"
                    : nowInfo.period;
                let refHour12;
                if (minDay && minDateTime) {
                  const h24 = minDateTime.getHours();
                  refHour12 = h24 % 12;
                  if (refHour12 === 0) refHour12 = 12;
                } else {
                  refHour12 = nowInfo.h12;
                }
                const refMinute =
                  minDay && minDateTime
                    ? minDateTime.getMinutes()
                    : nowInfo.minute;

                // Upper bound reference for max day
                let maxRefPeriod = null;
                let maxRefHour12 = null;
                let maxRefMinute = null;
                if (maxDay && maxDateTime) {
                  maxRefPeriod = maxDateTime.getHours() >= 12 ? "PM" : "AM";
                  const h24 = maxDateTime.getHours();
                  maxRefHour12 = h24 % 12;
                  if (maxRefHour12 === 0) maxRefHour12 = 12;
                  maxRefMinute = maxDateTime.getMinutes();
                }

                // Hours
                hourOptions.forEach((opt, i) => {
                  const hourVal = i + 1; // 1..12
                  let hide = false;
                  // Allowed window first
                  if (!isHourAllowedByWindow(selPeriod, hourVal)) hide = true;
                  // Relative to reference (now for start, min for end) when same day
                  if (!hide && (today || minDay)) {
                    const rel = comparePeriod(selPeriod, refPeriod);
                    if (rel < 0) hide = true; // Entire earlier period
                    else if (rel === 0 && hourVal < refHour12) hide = true; // Earlier hour in same period
                  }
                  // Upper bound when same as max day
                  if (!hide && maxDay && maxRefPeriod) {
                    const relMax = comparePeriod(selPeriod, maxRefPeriod);
                    if (relMax > 0)
                      hide = true; // Entire later period beyond max
                    else if (relMax === 0 && hourVal > maxRefHour12)
                      hide = true; // Later hour in same period
                  }
                  setHiddenOption(opt, hide);
                });

                // Minutes
                minuteOptions.forEach((opt, i) => {
                  let hide = false;
                  // At 10 PM allow only 00 minute
                  if (selPeriod === "PM" && selHour === 10) hide = i > 0;
                  // Relative reference minute only when same period, same hour, and same day/minDay
                  if (!hide && (today || minDay)) {
                    const rel = comparePeriod(selPeriod, refPeriod);
                    if (rel < 0) hide = true;
                    else if (
                      rel === 0 &&
                      selHour === refHour12 &&
                      i < refMinute
                    )
                      hide = true;
                  }
                  // Upper bound minutes when on max day
                  if (!hide && maxDay && maxRefPeriod) {
                    const relMax = comparePeriod(selPeriod, maxRefPeriod);
                    if (relMax > 0) hide = true;
                    else if (
                      relMax === 0 &&
                      selHour === maxRefHour12 &&
                      i > maxRefMinute
                    )
                      hide = true;
                  }
                  setHiddenOption(opt, hide);
                });

                // AM/PM disabling rule
                const allowedAM =
                  isHourAllowedByWindow("AM", 10) ||
                  isHourAllowedByWindow("AM", 11);
                const allowedPM =
                  isHourAllowedByWindow("PM", 12) ||
                  isHourAllowedByWindow("PM", 1);
                let disableAM = !allowedAM;
                let disablePM = !allowedPM;
                // Force-disable AM if on min boundary day and boundary time is PM
                if (minDay && minDateTime && minDateTime.getHours() >= 12) {
                  disableAM = true;
                } else if (today || minDay) {
                  // If reference period is PM and same day, AM becomes invalid
                  if (refPeriod === "PM") disableAM = true;
                }
                if (maxDay && maxDateTime) {
                  // If maximum period is AM on same day, PM becomes invalid
                  if (maxRefPeriod === "AM") disablePM = true;
                }
                setAmPmDisabled(amOption, disableAM);
                setAmPmDisabled(pmOption, disablePM);
                // Only switch if the currently selected period is now disabled
                if (disableAM && selPeriod === "AM") selectPeriod("PM");
                if (disablePM && selPeriod === "PM") selectPeriod("AM");
              };

              // Expose updater to instance for external calls (onChange)
              instance.updateTimeDisabledStates = updateDisabledStates;

              // Initialize selected AM/PM from input value
              selectPeriod((amPm.value || "AM").toUpperCase());
              updateDisabledStates();
            }
          }
        }
      },
    };

    flatpickrRef.current = flatpickr(inputRef.current, options);

    return () => {
      // Don't destroy if calendar is open - keep instance alive
      if (isCalendarOpenRef.current) {
        return;
      }
      
      if (
        flatpickrRef.current &&
        typeof flatpickrRef.current.destroy === "function"
      ) {
        try {
          if (flatpickrRef.current.__onDocMouseDown) {
            document.removeEventListener(
              "mousedown",
              flatpickrRef.current.__onDocMouseDown,
              true
            );
          }
          if (flatpickrRef.current.__handleKeyDown) {
            document.removeEventListener(
              "keydown",
              flatpickrRef.current.__handleKeyDown
            );
          }
        } catch {}
        flatpickrRef.current.destroy();
        flatpickrRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, enableTime]);

  // Update value when prop changes
  useEffect(() => {
    if (
      flatpickrRef.current &&
      typeof flatpickrRef.current.setDate === "function" &&
      value
    ) {
      // Sync external value without triggering onChange to avoid loops
      try {
        flatpickrRef.current.setDate(value, false);
      } catch {}
    }
  }, [value]);

  // Safeguard: Keep calendar open during parent re-renders
  useEffect(() => {
    // Check if calendar should be open but isn't
    const checkInterval = setInterval(() => {
      if (
        isCalendarOpenRef.current &&
        flatpickrRef.current &&
        !flatpickrRef.current.isOpen
      ) {
        // Reopen if it was closed unexpectedly
        try {
          flatpickrRef.current.open();
        } catch {}
      }
    }, 100); // Check every 100ms

    return () => clearInterval(checkInterval);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-600 focus:border-sky-500 dark:focus:border-sky-600 transition-all disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 ${className}`}
        readOnly
      />
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        {enableTime ? (
          <Clock size={18} className="text-gray-400 dark:text-gray-500" />
        ) : (
          <Calendar size={18} className="text-gray-400 dark:text-gray-500" />
        )}
      </div>

      <style>{`
        /* Base calendar styling with full dark theme support */
        .flatpickr-calendar {
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
          border: 1px solid #e5e7eb;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 0;
          background: white;
        }
        
        :root.dark .flatpickr-calendar {
          background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
          border-color: #374151;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
        }
        
        /* Header styling - Blue gradient in light, darker gradient in dark */
        .flatpickr-months .flatpickr-month {
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
          color: white;
          height: 44px;
          border-radius: 12px 12px 0 0;
          padding: 0;
        }
        
        :root.dark .flatpickr-months .flatpickr-month {
          background: linear-gradient(135deg, #0c4a6e 0%, #082f49 100%);
        }
        
        /* OK button in header - white text in dark mode */
        .flatpickr-ok-button {
          background: white !important;
          color: #0ea5e9 !important;
        }
        
        :root.dark .flatpickr-ok-button {
          background: rgba(255, 255, 255, 0.15) !important;
          color: #ffffff !important;
          border-color: rgba(255, 255, 255, 0.3) !important;
        }

        .flatpickr-current-month {
          padding: 0 8px;
        }
        
        .flatpickr-current-month .flatpickr-monthDropdown-months {
          background: transparent;
          color: white;
          font-weight: 600;
          font-size: 16px;
          border: none;
        }
        
        .flatpickr-current-month .flatpickr-monthDropdown-months option {
          background: white;
          color: #1e293b;
        }
        
        :root.dark .flatpickr-current-month .flatpickr-monthDropdown-months option {
          background: #1f2937;
          color: #ffffff;
        }

        .flatpickr-current-month .numInputWrapper {
          color: white;
        }

        .flatpickr-current-month .numInputWrapper input {
          color: white !important;
          font-weight: 600;
          font-size: 16px;
        }

        .flatpickr-months .flatpickr-prev-month,
        .flatpickr-months .flatpickr-next-month {
          fill: white;
        }
        
        .flatpickr-months .flatpickr-prev-month:hover svg,
        .flatpickr-months .flatpickr-next-month:hover svg {
          fill: rgba(255, 255, 255, 0.8);
        }

        /* Weekday headers - White text in dark mode */
        .flatpickr-weekday {
          color: #0ea5e9;
          font-weight: 600;
          font-size: 13px;
        }
        
        :root.dark .flatpickr-weekday {
          color: #ffffff !important;
        }
        
        /* Day cells - White text in dark mode */
        .flatpickr-day {
          border-radius: 8px;
          font-weight: 500;
          color: #1e293b;
        }
        
        :root.dark .flatpickr-day {
          color: #ffffff !important;
        }

        .flatpickr-day.selected,
        .flatpickr-day.selected:hover {
          background: #0ea5e9 !important;
          border-color: #0ea5e9 !important;
          color: #ffffff !important;
          font-weight: 600;
        }
        
        :root.dark .flatpickr-day.selected,
        :root.dark .flatpickr-day.selected:hover {
          background: #0284c7 !important;
          border-color: #0284c7 !important;
          color: #ffffff !important;
        }

        .flatpickr-day:hover {
          background: #e0f2fe;
          border-color: #e0f2fe;
          color: #0c4a6e;
        }
        
        :root.dark .flatpickr-day:hover {
          background: #1e3a8a !important;
          border-color: #1e3a8a !important;
          color: #ffffff !important;
        }

        .flatpickr-day.today {
          border-color: #0ea5e9;
          background: #dbeafe;
          color: #0c4a6e;
          font-weight: 600;
        }
        
        :root.dark .flatpickr-day.today {
          border-color: #38bdf8 !important;
          background: #1e3a8a !important;
          color: #ffffff !important;
        }
        
        /* Disabled and outside month days - Dimmed white in dark mode */
        .flatpickr-day.flatpickr-disabled,
        .flatpickr-day.flatpickr-disabled:hover,
        .flatpickr-day.prevMonthDay,
        .flatpickr-day.nextMonthDay {
          color: #94a3b8 !important;
        }
        
        :root.dark .flatpickr-day.flatpickr-disabled,
        :root.dark .flatpickr-day.flatpickr-disabled:hover,
        :root.dark .flatpickr-day.prevMonthDay,
        :root.dark .flatpickr-day.nextMonthDay {
          color: #6b7280 !important;
        }

        /* Side-by-side layout for time picker */
        .flatpickr-custom .flatpickr-innerContainer {
          display: flex !important;
          flex-direction: row !important;
          align-items: stretch !important;
          gap: 0 !important;
        }

        .flatpickr-custom .flatpickr-rContainer {
          flex: 0 0 auto;
          width: 308px !important;
        }

        .flatpickr-custom .flatpickr-days {
          width: 308px !important;
        }

        .flatpickr-custom .flatpickr-day {
          height: 39px !important;
          line-height: 39px !important;
          max-width: 44px !important;
        }
        
        /* iOS-style time picker panel */
        .flatpickr-custom .flatpickr-time {
          display: flex !important;
          flex-direction: column !important;
          padding: 20px 16px !important;
          border-left: 1px solid #e2e8f0 !important;
        }
        
        :root.dark .flatpickr-custom .flatpickr-time {
          border-left-color: #374151 !important;
          background: #1f2937;
        }
        
        /* Time picker heading - White text in dark mode */
        .time-heading {
          color: #0ea5e9;
        }
        
        :root.dark .time-heading {
          color: #ffffff !important;
          border-bottom-color: #374151 !important;
        }
        
        .time-labels-container {
          border-bottom: 1px solid #e2e8f0;
        }
        
        :root.dark .time-labels-container {
          border-bottom-color: #374151 !important;
        }
        
        /* Time labels - White text in dark mode */
        .time-label {
          color: #64748b;
        }
        
        :root.dark .time-label {
          color: #ffffff !important;
        }
        
        /* Time scroller backgrounds - Dark theme */
        .time-scroller,
        .hour-scroller,
        .minute-scroller {
          background: #fafafa;
          border-color: #e2e8f0;
        }
        
        :root.dark .time-scroller,
        :root.dark .hour-scroller,
        :root.dark .minute-scroller {
          background: #111827 !important;
          border-color: #374151 !important;
        }
        
        .ampm-box {
          background: #fafafa;
          border-color: #e2e8f0;
        }
        
        :root.dark .ampm-box {
          background: #111827 !important;
          border-color: #374151 !important;
        }
        
        :root.dark .ampm-box .ampm-option {
          border-top-color: #374151 !important;
        }
        
        /* Time options text - White in dark mode */
        .time-option {
          color: #475569;
        }
        
        :root.dark .time-option {
          color: #ffffff !important;
        }
        
        .ampm-option {
          color: #475569;
        }
        
        :root.dark .ampm-option {
          color: #ffffff !important;
        }
        
        /* Hide separator and default inputs */
        .flatpickr-custom .flatpickr-time .flatpickr-time-separator,
        .flatpickr-custom .flatpickr-time .numInputWrapper {
          display: none !important;
        }
        
        /* Time option hover effect - White text maintained */
        .time-option:hover {
          background: #dbeafe !important;
          color: #0ea5e9 !important;
        }
        
        :root.dark .time-option:hover {
          background: #1e3a8a !important;
          color: #ffffff !important;
        }
        
        .time-option.disabled { 
          color: #94a3b8 !important; 
          background: transparent !important; 
          cursor: default !important; 
          pointer-events: none !important; 
          opacity: 0.6 !important; 
        }
        
        :root.dark .time-option.disabled {
          color: #6b7280 !important;
        }
        
        .ampm-option { 
          transition: background 0.2s, color 0.2s; 
        }
        
        .ampm-option:hover { 
          background: #dbeafe; 
          color: #0ea5e9; 
        }
        
        :root.dark .ampm-option:hover { 
          background: #1e3a8a; 
          color: #ffffff; 
        }
        
        .ampm-option.active { 
          background: #0ea5e9; 
          color: #ffffff; 
        }
        
        :root.dark .ampm-option.active { 
          background: #0284c7; 
          color: #ffffff; 
        }
        
        .ampm-option.disabled { 
          background: #e5e7eb !important; 
          color: #94a3b8 !important; 
        }
        
        :root.dark .ampm-option.disabled { 
          background: #374151 !important; 
          color: #6b7280 !important; 
        }
        
        /* Gradient fade for scrollers */
        .time-scroller::before,
        .time-scroller::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          height: 30px;
          pointer-events: none;
          z-index: 1;
        }
        
        .time-scroller::before {
          top: 0;
          background: linear-gradient(to bottom, #f1f5f9, transparent);
          border-radius: 8px 8px 0 0;
        }
        
        :root.dark .time-scroller::before {
          background: linear-gradient(to bottom, #111827, transparent);
        }
        
        .time-scroller::after {
          bottom: 0;
          background: linear-gradient(to top, #f1f5f9, transparent);
          border-radius: 0 0 8px 8px;
        }
        
        :root.dark .time-scroller::after {
          background: linear-gradient(to top, #111827, transparent);
        }
        
        /* OK Button styling */
        .flatpickr-custom .ok-button-container {
          padding: 12px 16px;
          border-top: 1px solid #e2e8f0;
          background: white;
        }
        
        :root.dark .flatpickr-custom .ok-button-container {
          border-top-color: #374151;
          background: #1f2937;
        }
        
        .flatpickr-custom .ok-button {
          width: 100%;
          padding: 10px 20px;
          background: #0ea5e9;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        :root.dark .flatpickr-custom .ok-button {
          background: #0284c7;
        }
        
        .flatpickr-custom .ok-button:hover {
          background: #0284c7;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }
        
        :root.dark .flatpickr-custom .ok-button:hover {
          background: #0369a1;
        }
        
        .flatpickr-custom .ok-button:active {
          background: #0369a1;
          transform: translateY(1px);
        }
        
        :root.dark .flatpickr-custom .ok-button:active {
          background: #075985;
        }
      `}</style>
    </div>
  );
}
