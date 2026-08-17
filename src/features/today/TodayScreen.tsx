import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SymbolView } from 'expo-symbols';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import { useTodayData, type ItemDraft } from '@/hooks/use-today';
import { useLocalToday } from '@/hooks/use-local-today';
import type { Goal, LocationPlace, PlanningItem, SearchResult } from '@/models/planning';
import {
  addLocalDays,
  dateFromISO,
  daysFromToday,
  formatDay,
  formatDestination,
  formatLongDate,
  formatShortDate,
  localISO,
} from '@/shared/date';
import { eventPhase, timeMinutes } from '@/shared/time';
import { orderedWeekdayLabels, weekdayOffset } from '@/shared/week';
import { openItemInMaps } from '@/services/maps';
import { palette, type AppColors } from '@/theme/colors';
import CalendreamMapKit from '../../../modules/calendream-mapkit/src/CalendreamMapKitModule';
import type { MapSuggestion } from '../../../modules/calendream-mapkit/src/CalendreamMapKit.types';
import { DailyReflection } from './components/DailyReflection';
import { CompactCalendarOverlay } from '@/features/calendar/CompactCalendarOverlay';
import { QuickCaptureSheet } from '@/features/quick-capture/QuickCaptureSheet';
import type { CaptureKind } from '@/features/quick-capture/parseQuickCapture';
import { SearchOverlay } from '@/features/search/SearchResults';
import { TimelineScreen } from '@/features/timeline/TimelineScreen';
import { GoalsHabitsScreen } from '@/features/goals/GoalsHabitsScreen';

type Destination = 'today' | 'timeline' | 'goals';
type EditorState = { kind: 'task' | 'event'; item?: PlanningItem } | null;
type CapturePreset = { date: string; endDate?: string; kind?: CaptureKind; dateLocked?: boolean };

function eventAccent(event: PlanningItem, colors: AppColors) {
  const phase = eventPhase(event);
  return phase === 'past' ? colors.tertiary : phase === 'current' ? colors.red : colors.blue;
}

function configureEditorLayout() {
  LayoutAnimation.configureNext({
    duration: 250,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
  });
}

function configureEditorClose() {
  LayoutAnimation.configureNext({
    duration: 340,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
  });
}

export function TodayScreen() {
  const dark = useColorScheme() === 'dark';
  const colors = dark ? palette.dark : palette.light;
  const today = useLocalToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const data = useTodayData(selectedDate, today);
  const searchAll = data.searchAll;
  const [destination, setDestination] = useState<Destination>('today');
  const [editor, setEditor] = useState<EditorState>(null);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [capturePreset, setCapturePreset] = useState<CapturePreset | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [timelineRevision, setTimelineRevision] = useState(0);
  const [timelineEntryRevision, setTimelineEntryRevision] = useState(0);
  const [journal, setJournal] = useState('');
  const [briefingSessionActive, setBriefingSessionActive] = useState(false);
  const [inlineEditor, setInlineEditor] = useState<EditorState>(null);
  const [inlineDraft, setInlineDraft] = useState<ItemDraft | null>(null);
  const todayScroll = useRef<ScrollView>(null);
  const dayPage = useRef<View>(null);
  const keyboardTop = useRef(Dimensions.get('window').height);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setSelectedDate(today);
    });
    return () => subscription.remove();
  }, [today]);

  useEffect(() => {
    const timer = setTimeout(() => setSelectedDate(today), 0);
    return () => clearTimeout(timer);
  }, [today]);

  useEffect(() => {
    const timer = setTimeout(() => setJournal(data.journal), 0);
    return () => clearTimeout(timer);
  }, [data.journal]);

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      const timer = setTimeout(() => {
        setSearchResults([]);
        setSearchLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearchLoading(true);
      void searchAll(searchQuery).then((results) => {
        if (cancelled) return;
        setSearchResults(results);
        setSearchLoading(false);
      });
    }, 140);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchAll, searchOpen, searchQuery]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardTop.current = Dimensions.get('window').height;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const events = useMemo(
    () => data.items
      .filter((item) => item.kind === 'event')
      .sort((a, b) => timeMinutes(a.startTime) - timeMinutes(b.startTime)),
    [data.items],
  );
  const tasks = useMemo(
    () => data.items.filter((item) => item.kind === 'task'),
    [data.items],
  );
  const prioritizedGoals = useMemo(() => data.goals.filter((goal) => !goal.completed).sort((a, b) => {
    const scopePriority = { year: 0, quarter: 1, month: 2 };
    return scopePriority[a.scope] - scopePriority[b.scope] || a.targetDate.localeCompare(b.targetDate);
  }), [data.goals]);
  const now = new Date();
  const currentMinutes = selectedDate === today ? now.getHours() * 60 + now.getMinutes() : selectedDate > today ? -1 : Number.MAX_SAFE_INTEGER;
  const nextEvent = events.find((event) => {
    const minutes = timeMinutes(event.startTime);
    return minutes === -1 || minutes >= currentMinutes;
  });

  async function saveDraft(draft: ItemDraft) {
    await data.saveItem(draft);
    setTimelineRevision((revision) => revision + 1);
    setEditor(null);
  }

  async function removeItem(id: string) {
    await data.deleteItem(id);
    setTimelineRevision((revision) => revision + 1);
    setEditor(null);
  }

  async function saveInline(draft: ItemDraft) {
    await data.saveItem(draft);
    setTimelineRevision((revision) => revision + 1);
    configureEditorClose();
    setInlineDraft(null);
    setInlineEditor(null);
  }

  async function toggleInlineEditor(item: PlanningItem) {
    const editingItem = inlineEditor?.item;
    if (editingItem && inlineDraft?.title.trim()) await data.saveItem(inlineDraft);

    if (editingItem?.id === item.id) {
      configureEditorClose();
      setInlineDraft(null);
      setInlineEditor(null);
      Keyboard.dismiss();
      return;
    }

    configureEditorLayout();
    setInlineDraft({
      id: item.id,
      kind: item.kind,
      title: item.title,
      date: item.anchorStart ?? selectedDate,
      endDate: item.anchorEnd ?? undefined,
      precision: item.precision,
      altitude: item.altitude,
      eventType: item.eventType,
      time: item.startTime,
      endTime: item.endTime,
      notes: item.notes,
      location: item.location,
      locationPlace: item.locationPlace,
    });
    setInlineEditor({ kind: item.kind, item });
  }

  function closeInlineEditor() {
    configureEditorClose();
    setInlineDraft(null);
    setInlineEditor(null);
    Keyboard.dismiss();
  }

  async function toggleNewInlineEditor(kind: 'task' | 'event') {
    if (inlineEditor?.item && inlineDraft?.title.trim()) await data.saveItem(inlineDraft);
    const sameNewEditor = inlineEditor?.kind === kind && !inlineEditor.item;
    if (sameNewEditor) {
      closeInlineEditor();
      return;
    }
    configureEditorLayout();
    setInlineDraft(null);
    setInlineEditor({ kind });
  }

  function moveTask(taskId: string, targetIndex: number) {
    const index = tasks.findIndex((task) => task.id === taskId);
    const target = Math.max(0, Math.min(tasks.length - 1, targetIndex));
    if (index < 0 || target === index) return;
    const ordered = [...tasks];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    void data.reorderTasks(ordered.map((task) => task.id));
  }

  function revealInline(y: number, height: number) {
    setTimeout(() => {
      dayPage.current?.measureInWindow((_x, pageY, _width, pageHeight) => {
        const visibleHeight = Math.max(180, Math.min(keyboardTop.current, pageY + pageHeight) - pageY - 12);
        const breathingRoom = Math.max(8, (visibleHeight - height) / 2);
        todayScroll.current?.scrollTo({ y: Math.max(0, y - breathingRoom), animated: true });
      });
    }, Platform.OS === 'ios' ? 90 : 140);
  }

  function openSearch() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDestination('today');
    setCalendarOpen(false);
    setSearchOpen(true);
  }

  function openQuickCapture(preset?: CapturePreset) {
    setCapturePreset(preset ?? null);
    setQuickCaptureOpen(true);
  }

  function closeQuickCapture() {
    setQuickCaptureOpen(false);
    setCapturePreset(null);
  }

  function toggleCalendar() {
    Keyboard.dismiss();
    if (searchOpen) closeSearch();
    setCalendarOpen((open) => !open);
  }

  function openTimelineHome() {
    Keyboard.dismiss();
    setCalendarOpen(false);
    if (searchOpen) closeSearch();
    setTimelineEntryRevision((revision) => revision + 1);
    setDestination('timeline');
  }

  function openGoalsAndHabits() {
    setSelectedDate(today);
    setCalendarOpen(false);
    setSearchOpen(false);
    setInlineEditor(null);
    setEditor(null);
    setDestination('goals');
  }

  function closeSearch() {
    Keyboard.dismiss();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  function selectSearchResult(result: SearchResult) {
    setDestination('today');
    setSelectedDate(result.date);
    closeSearch();
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.topBar}>
        {searchOpen ? (
          <>
          <View style={[styles.searchOrb, { backgroundColor: colors.card }]}>
            <SymbolView name="magnifyingglass" size={16} tintColor={colors.secondary} />
            <TextInput
              autoFocus
              clearButtonMode="while-editing"
              onChangeText={(value) => {
                if (Boolean(value.trim()) !== Boolean(searchQuery.trim())) {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                }
                setSearchQuery(value);
              }}
              placeholder="Search Calendream"
              placeholderTextColor={colors.tertiary}
              returnKeyType="search"
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
            />
            <Pressable accessibilityLabel="Close search" hitSlop={8} onPress={closeSearch}>
              <SymbolView name="xmark.circle.fill" size={18} tintColor={colors.tertiary} />
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel="Add an item"
            onPress={() => openQuickCapture()}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Text style={styles.addSymbol}>+</Text>
          </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.wordmark, { color: colors.text }]}>Calendream</Text>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel="Search"
                onPress={openSearch}
                style={({ pressed }) => [styles.searchButton, { backgroundColor: colors.card }, pressed && styles.pressed]}
              >
                <SymbolView name="magnifyingglass" size={16} tintColor={colors.text} />
              </Pressable>
              <Pressable
                accessibilityLabel={calendarOpen ? 'Close calendar' : 'Open calendar'}
                onPress={toggleCalendar}
                style={({ pressed }) => [styles.calendarButton, { backgroundColor: calendarOpen ? colors.blueSoft : colors.card }, pressed && styles.pressed]}
              >
                <SymbolView name="calendar" size={16} tintColor={calendarOpen ? colors.blue : colors.text} />
              </Pressable>
              <Pressable
                accessibilityLabel="Add an item"
                onPress={() => openQuickCapture()}
                style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
              >
                <Text style={styles.addSymbol}>+</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {destination === 'today' && (
        <CompactDateRail colors={colors} onSelect={(date) => {
          setSelectedDate(date);
          setInlineEditor(null);
          setEditor(null);
        }} selectedDate={selectedDate} today={today} />
      )}

      {destination === 'today' ? (
        <View ref={dayPage} style={styles.dayPage}>
        <ScrollView
          key={selectedDate}
          ref={todayScroll}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {data.upcoming.length > 0 && (
            <ScrollView
              horizontal
              contentContainerStyle={styles.upcomingList}
              showsHorizontalScrollIndicator={false}
              style={styles.upcomingScroller}
            >
              {data.upcoming.map((item) => {
                const days = daysFromToday(item.anchorStart ?? selectedDate);
                const trip = item.eventType === 'trip' || (item.anchorStart !== null && item.anchorEnd !== null && item.anchorEnd > item.anchorStart);
                const titleAlreadyIncludesDates = /^[A-Z][a-z]+\s+\d{1,2}\s*[-–—]\s*\d{1,2}/.test(item.title);
                const label = trip && item.anchorStart
                  ? titleAlreadyIncludesDates ? item.title : `${formatShortDate(item.anchorStart)}${item.anchorEnd && item.anchorEnd !== item.anchorStart ? `–${formatShortDate(item.anchorEnd)}` : ''} ${item.title}`
                  : `${item.title} · ${days === 1 ? 'tomorrow' : `in ${days} days`}`;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setEditor({ kind: 'event', item })}
                    style={[styles.upcomingPill, { backgroundColor: trip ? colors.orangeSoft : colors.blueSoft }]}
                  >
                    <Text style={[styles.upcomingText, { color: trip ? colors.orange : colors.blue }]} numberOfLines={1}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {prioritizedGoals.length > 0 && (
            <ScrollView horizontal contentContainerStyle={styles.goalReminderList} showsHorizontalScrollIndicator={false} style={styles.goalReminderScroller}>
              {prioritizedGoals.map((goal) => <TodayGoalPill colors={colors} goal={goal} key={goal.id} onToggle={() => void data.toggleGoal(goal)} />)}
            </ScrollView>
          )}

          <View style={[styles.upNextCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardEyebrow, { color: colors.secondary }]}>UP NEXT</Text>
            {nextEvent ? (
              <Pressable onPress={() => void toggleInlineEditor(nextEvent)}>
                <Text style={[styles.upNextTitle, { color: colors.text }]}>{nextEvent.title}</Text>
                <Text style={[styles.upNextMeta, { color: colors.blue }]}>
                  {nextEvent.startTime || 'All day'}
                </Text>
              </Pressable>
            ) : events.length > 0 ? (
              <Pressable onPress={() => void toggleNewInlineEditor('event')}>
                <Text style={[styles.upNextTitle, { color: colors.text }]}>Events complete</Text>
                <Text style={[styles.upNextMeta, { color: colors.blue }]}>Plan what comes next</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => void toggleNewInlineEditor('event')}>
                <Text style={[styles.upNextTitle, { color: colors.text }]}>Your day is open</Text>
                <Text style={[styles.upNextMeta, { color: colors.blue }]}>Add an event</Text>
              </Pressable>
            )}
          </View>

          {data.loading ? (
            <ActivityIndicator color={colors.blue} style={styles.loader} />
          ) : (
            <>
              <SectionHeader
                action="Add event"
                colors={colors}
                onAction={() => void toggleNewInlineEditor('event')}
                title="Events"
              />
              {events.map((event) => {
                const habitEntries = event.habitId
                  ? data.habitActivity.filter((entry) => entry.habitId === event.habitId && entry.date === selectedDate)
                  : [];
                const habitEntry = habitEntries.find((entry) => entry.completed || entry.failed || entry.skipped) ?? habitEntries[0];
                const showHabitCheckIn = Boolean(event.habitId && eventPhase(event) === 'past' && !habitEntry?.completed && !habitEntry?.failed);
                return (
                <Fragment key={event.id}>
                <Pressable
                  onPress={() => void toggleInlineEditor(event)}
                  style={({ pressed }) => [
                    styles.eventRow,
                    { borderColor: colors.separator },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.eventTime, { color: colors.secondary }]}>
                    {event.startTime || 'All day'}
                  </Text>
                  <View style={[styles.eventRule, { backgroundColor: eventAccent(event, colors) }]} />
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{event.title}</Text>
                    {(event.notes || event.location) && (
                      <Text style={[styles.rowNote, { color: colors.secondary }]} numberOfLines={1}>
                        {[event.location, event.notes].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </View>
                  {event.location && (
                    <Pressable
                      accessibilityLabel={`Open ${event.location} in Maps`}
                      hitSlop={8}
                      onPress={(pressEvent) => {
                        pressEvent.stopPropagation();
                        void openItemInMaps(event);
                      }}
                      style={[styles.mapsButton, { backgroundColor: colors.blueSoft }]}
                    >
                      <Text style={[styles.mapsButtonText, { color: colors.blue }]}>Maps</Text>
                    </Pressable>
                  )}
                </Pressable>
                  {showHabitCheckIn && (
                    <View style={[styles.habitEventCheckIn, { backgroundColor: colors.blueSoft }]}>
                      <View style={styles.rowCopy}>
                        <Text style={[styles.habitEventQuestion, { color: colors.text }]}>Did you complete this habit?</Text>
                        <Text style={[styles.habitEventMeta, { color: colors.secondary }]}>This updates your habit tracker.</Text>
                      </View>
                      <Pressable onPress={() => event.habitId && void data.markHabitFailed(event.habitId, selectedDate)} style={[styles.habitEventChoice, { borderColor: colors.blue }]}><Text style={[styles.habitEventChoiceText, { color: colors.blue }]}>No</Text></Pressable>
                      <Pressable onPress={() => void data.toggleTask(event)} style={[styles.habitEventChoice, { backgroundColor: colors.blue, borderColor: colors.blue }]}><Text style={[styles.habitEventChoiceText, { color: '#FFFFFF' }]}>Yes</Text></Pressable>
                    </View>
                  )}
                  {habitEntry?.failed && <Text style={[styles.habitEventMissed, { color: colors.tertiary }]}>Habit marked not completed</Text>}
                  {inlineEditor?.item?.id === event.id && (
                    <InlineComposer colors={colors} initial={event} key={event.id} kind="event" onCancel={closeInlineEditor} onDraftChange={setInlineDraft} onReveal={revealInline} onSave={saveInline} today={selectedDate} />
                  )}
                </Fragment>
                );
              })}
              {inlineEditor?.kind === 'event' && !inlineEditor.item && (
                <InlineComposer colors={colors} key="new-event" kind="event" onCancel={closeInlineEditor} onReveal={revealInline} onSave={saveInline} today={selectedDate} />
              )}

              <SectionHeader
                action="Add task"
                colors={colors}
                onAction={() => void toggleNewInlineEditor('task')}
                title="Tasks"
              />
              {tasks.map((task, index) => (
                <Fragment key={task.id}>
                  <DraggableTaskRow colors={colors} index={index} onEdit={() => void toggleInlineEditor(task)} onMove={moveTask} onToggle={() => void data.toggleTask(task)} task={task} />
                  {inlineEditor?.item?.id === task.id && (
                    <InlineComposer colors={colors} initial={task} key={task.id} kind="task" onCancel={closeInlineEditor} onDraftChange={setInlineDraft} onReveal={revealInline} onSave={saveInline} today={selectedDate} />
                  )}
                </Fragment>
              ))}
              {inlineEditor?.kind === 'task' && !inlineEditor.item && (
                <InlineComposer colors={colors} key="new-task" kind="task" onCancel={closeInlineEditor} onReveal={revealInline} onSave={saveInline} today={selectedDate} />
              )}

              <DailyReflection
                colors={colors}
                date={selectedDate}
                key={selectedDate}
                onChange={setJournal}
                onReveal={revealInline}
                onSave={(value) => data.saveJournal(value)}
                onSaveToLibrary={(value) => data.saveJournalToLibrary(value)}
                savedToLibrary={data.journalInLibrary}
                today={today}
                value={journal}
              />
            </>
          )}
        </ScrollView>
        </View>
      ) : destination === 'timeline' ? (
        <TimelineScreen
          colors={colors}
          dataRevision={timelineRevision}
          key={`timeline-home-${timelineEntryRevision}`}
          loadRange={data.loadRange}
          onSaveItem={async (draft) => {
            await data.saveItem(draft);
            setTimelineRevision((revision) => revision + 1);
          }}
          onToggleGoal={async (goal) => {
            await data.toggleGoal(goal);
            setTimelineRevision((revision) => revision + 1);
          }}
          onToggleTask={async (item) => {
            await data.toggleTask(item);
            setTimelineRevision((revision) => revision + 1);
          }}
          onOpenDay={(date) => {
            setSelectedDate(date);
            setDestination('today');
          }}
          renderInlineEditor={({ item, date, onCancel, onDraftChange, onReveal, onSave }) => (
            <InlineComposer
              colors={colors}
              initial={item}
              key={`timeline-${item.id}`}
              kind={item.kind}
              onCancel={onCancel}
              onDraftChange={onDraftChange}
              onReveal={() => onReveal()}
              onSave={onSave}
              today={date}
            />
          )}
          today={today}
        />
      ) : (
        <GoalsHabitsScreen
          colors={colors}
          goalHabitLinks={data.goalHabitLinks}
          goalSteps={data.goalSteps}
          goals={data.allGoals}
          habitActivity={data.habitActivity}
          habits={data.habits}
          onArchiveHabit={data.archiveHabit}
          onDeleteGoal={data.deleteGoal}
          onDeleteGoalStep={data.deleteGoalStep}
          onLinkHabitToGoal={data.linkHabitToGoal}
          onSaveGoal={data.saveGoal}
          onSaveGoalStep={data.saveGoalStep}
          onSaveHabit={data.saveHabit}
          onSaveItem={async (draft) => {
            await data.saveItem(draft);
            setTimelineRevision((revision) => revision + 1);
          }}
          onToggleGoal={data.toggleGoal}
          onToggleGoalStep={data.toggleGoalStep}
          onToggleHabitDate={data.toggleHabitDate}
          onToggleHabitSkip={data.toggleHabitSkip}
          onUnlinkHabitFromGoal={data.unlinkHabitFromGoal}
          today={today}
        />
      )}

      {searchOpen && Boolean(searchQuery.trim()) && (
        <SearchOverlay colors={colors} loading={searchLoading} onSelect={selectSearchResult} query={searchQuery} results={searchResults} />
      )}

      {calendarOpen && (
        <CompactCalendarOverlay
          colors={colors}
          dataRevision={timelineRevision}
          initialDate={selectedDate}
          loadRange={data.loadRange}
          onAddDate={(date) => openQuickCapture({ date, dateLocked: true, kind: 'event' })}
          onClose={() => setCalendarOpen(false)}
          onSelectRange={(date, endDate) => openQuickCapture({ date, dateLocked: true, endDate, kind: 'trip' })}
          onViewDate={(date) => {
            setSelectedDate(date);
            setInlineEditor(null);
            setEditor(null);
            setCalendarOpen(false);
            setDestination('today');
          }}
          selectedEndDate={quickCaptureOpen ? capturePreset?.endDate ?? capturePreset?.date : undefined}
          selectedStartDate={quickCaptureOpen ? capturePreset?.date : undefined}
          today={today}
        />
      )}

      <View style={[styles.tabBar, { backgroundColor: colors.chrome, borderColor: colors.separator }]}>
        <TabButton active={destination === 'today'} colors={colors} label="Today" onPress={() => setDestination('today')} />
        <TabButton active={destination === 'timeline'} colors={colors} label="Timeline" onPress={openTimelineHome} />
        <TabButton accent={colors.yellow} active={destination === 'goals'} colors={colors} label="Plan" onPress={openGoalsAndHabits} />
      </View>

      <ItemEditor
        colors={colors}
        initial={editor}
        key={`${editor?.item?.id ?? 'new'}-${editor?.kind ?? 'closed'}`}
        onClose={() => setEditor(null)}
        onDelete={removeItem}
        onSave={saveDraft}
        today={selectedDate}
      />
      <QuickCaptureSheet
        colors={colors}
        date={capturePreset?.date ?? selectedDate}
        dateLocked={capturePreset?.dateLocked}
        endDate={capturePreset?.endDate}
        initialKind={capturePreset?.kind}
        key={`${quickCaptureOpen}-${capturePreset?.date ?? selectedDate}-${capturePreset?.endDate ?? 'single'}-${capturePreset?.kind ?? 'automatic'}`}
        onClose={closeQuickCapture}
        onSave={async (draft) => {
          await data.saveItem(draft);
          setTimelineRevision((revision) => revision + 1);
        }}
        visible={quickCaptureOpen}
      />
      <MorningBriefing
        colors={colors}
        onMoveTask={async (id, date) => {
          setBriefingSessionActive(true);
          await data.moveOverdueTask(id, date);
        }}
        onSkip={async () => {
          setBriefingSessionActive(false);
          await data.skipMorningReview();
        }}
        tasks={data.overdueTasks}
        today={today}
        visible={selectedDate === today && (data.morningReviewDue || briefingSessionActive) && data.overdueTasks.length > 0}
      />
    </SafeAreaView>
  );
}

function CompactDateRail({ today, selectedDate, colors, onSelect }: {
  today: string;
  selectedDate: string;
  colors: AppColors;
  onSelect: (date: string) => void;
}) {
  const pastDayCount = 14;
  const homeOffset = pastDayCount * 48 + 18;
  const strip = useRef<ScrollView>(null);
  const [todayExpansion] = useState(() => new Animated.Value(1));
  const [todayExpanded, setTodayExpanded] = useState(true);
  const pastDays = Array.from({ length: pastDayCount }, (_, index) => addLocalDays(today, index - pastDayCount));
  const futureDays = Array.from({ length: 45 }, (_, index) => addLocalDays(today, index + 1));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || selectedDate !== today) return;
      setTodayExpanded(true);
      todayExpansion.stopAnimation();
      todayExpansion.setValue(1);
      setTimeout(() => strip.current?.scrollTo({ x: homeOffset, animated: false }), 0);
    });
    return () => subscription.remove();
  }, [homeOffset, selectedDate, strip, today, todayExpansion]);

  function collapseToday() {
    if (!todayExpanded) return;
    setTodayExpanded(false);
    Animated.timing(todayExpansion, { toValue: 0, duration: 220, useNativeDriver: false }).start();
  }

  function selectDate(date: string) {
    if (date !== today) {
      collapseToday();
      onSelect(date);
      return;
    }

    onSelect(today);
    setTodayExpanded(true);
    todayExpansion.stopAnimation();
    strip.current?.scrollTo({ x: homeOffset, animated: true });
    Animated.timing(todayExpansion, { toValue: 1, duration: 260, useNativeDriver: false }).start(({ finished }) => {
      if (finished) strip.current?.scrollTo({ x: homeOffset, animated: false });
    });
  }

  return (
    <View style={[styles.dateStripFrame, { borderColor: colors.separator }]}>
      <ScrollView
        contentContainerStyle={styles.dateStripContent}
        contentOffset={{ x: homeOffset, y: 0 }}
        decelerationRate="fast"
        horizontal
        onScrollBeginDrag={collapseToday}
        ref={strip}
        showsHorizontalScrollIndicator={false}
      >
        {pastDays.map((date) => <RailDay colors={colors} date={date} key={date} onSelect={selectDate} selectedDate={selectedDate} today={today} />)}
        <Animated.View style={[styles.todayMorph, {
          width: todayExpansion.interpolate({ inputRange: [0, 1], outputRange: [48, 210] }),
        }]}>
          <Pressable accessibilityLabel="Return to today" onPress={() => selectDate(today)} style={styles.todayMorphButton}>
            <Animated.View pointerEvents="none" style={[styles.expandedToday, { opacity: todayExpansion }]}>
              <Text style={[styles.compactEyebrow, { color: colors.red }]}>TODAY</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.compactDateTitle, { color: colors.text }]}>{formatDay(today)}</Text>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.collapsedToday, {
              opacity: todayExpansion.interpolate({ inputRange: [0, 0.35], outputRange: [1, 0] }),
            }]}>
              <Text style={[styles.dayRailLabel, { color: colors.red }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(dateFromISO(today))}</Text>
              <View style={[styles.dayRailOrb, { backgroundColor: colors.red }]}>
                <Text style={[styles.dayRailNumber, { color: '#FFFFFF' }]}>{dateFromISO(today).getDate()}</Text>
              </View>
            </Animated.View>
          </Pressable>
        </Animated.View>
        {futureDays.map((date) => <RailDay colors={colors} date={date} key={date} onSelect={selectDate} selectedDate={selectedDate} today={today} />)}
      </ScrollView>
    </View>
  );
}

function RailDay({ date, today, selectedDate, colors, onSelect }: {
  date: string;
  today: string;
  selectedDate: string;
  colors: AppColors;
  onSelect: (date: string) => void;
}) {
  const selected = date === selectedDate;
  const actualToday = date === today;
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(dateFromISO(date));
  return (
    <Pressable accessibilityLabel={formatDay(date)} onPress={() => onSelect(date)} style={styles.dayRailItem}>
      <Text style={[styles.dayRailLabel, { color: actualToday ? colors.red : colors.secondary }]}>{weekday}</Text>
      <View style={[
        styles.dayRailOrb,
        actualToday && !selected && { backgroundColor: colors.red },
        selected && { backgroundColor: colors.blue },
      ]}>
        <Text style={[styles.dayRailNumber, { color: selected || actualToday ? '#FFFFFF' : colors.text }]}>{dateFromISO(date).getDate()}</Text>
      </View>
    </Pressable>
  );
}

function SectionHeader({ title, action, onAction, colors }: {
  title: string;
  action?: string;
  onAction?: () => void;
  colors: AppColors;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action && (
        <Pressable hitSlop={8} onPress={onAction}>
          <Text style={[styles.sectionAction, { color: colors.blue }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function TabButton({ active, label, onPress, colors, accent }: {
  active: boolean;
  label: string;
  onPress: () => void;
  colors: AppColors;
  accent?: string;
}) {
  const activeColor = accent ?? colors.blue;
  return (
    <Pressable onPress={onPress} style={styles.tabButton}>
      <View style={[styles.tabGlyph, { backgroundColor: active ? activeColor : colors.card }]} />
      <Text style={[styles.tabLabel, { color: active ? activeColor : colors.secondary }]}>{label}</Text>
    </Pressable>
  );
}

function DraggableTaskRow({ task, index, colors, onToggle, onEdit, onMove }: {
  task: PlanningItem;
  index: number;
  colors: AppColors;
  onToggle: () => void;
  onEdit: () => void;
  onMove: (id: string, targetIndex: number) => void;
}) {
  const [translateY] = useState(() => new Animated.Value(0));
  const [dragging, setDragging] = useState(false);
  const [suppressPress, setSuppressPress] = useState(false);

  const dragGesture = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(280)
    .runOnJS(true)
    .onStart(() => {
      setDragging(true);
      setSuppressPress(true);
    })
    .onUpdate((event) => translateY.setValue(event.translationY))
    .onEnd((event) => {
      const target = index + Math.round(event.translationY / 48);
      onMove(task.id, target);
    })
    .onFinalize(() => {
      setDragging(false);
      Animated.timing(translateY, { toValue: 0, duration: 160, useNativeDriver: true }).start();
    }), [index, onMove, task.id, translateY]);

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View
        style={[styles.taskRow, { borderColor: colors.separator, opacity: dragging ? 0.82 : 1, transform: [{ translateY }] }]}
      >
      <Pressable
        accessibilityLabel={task.completed ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
        hitSlop={8}
        onPress={onToggle}
        style={[
          styles.checkbox,
          { borderColor: task.completed ? colors.blue : colors.tertiary },
          task.completed && { backgroundColor: colors.blue },
        ]}
      >
        {task.completed && <Text style={styles.checkmark}>✓</Text>}
      </Pressable>
      <Pressable
        onPress={() => {
          if (suppressPress) {
            setSuppressPress(false);
            return;
          }
          onEdit();
        }}
        style={styles.taskCopy}
      >
        <Text style={[styles.rowTitle, { color: task.completed ? colors.secondary : colors.text }, task.completed && styles.completed]}>{task.title}</Text>
        {task.notes && <Text style={[styles.rowNote, { color: colors.secondary }]} numberOfLines={1}>{task.notes}</Text>}
      </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

function InlineTimePicker({ value, colors, onChange }: {
  value: string;
  colors: AppColors;
  onChange: (value: string) => void;
}) {
  const [selectedTime, setSelectedTime] = useState(() => {
    const date = new Date();
    const match = value.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/i);
    let hour = Number(match?.[1] ?? 9);
    const minute = Number(match?.[2] ?? 0);
    const period = match?.[3]?.toUpperCase();
    if (period === 'AM' && hour === 12) hour = 0;
    if (period === 'PM' && hour < 12) hour += 12;
    date.setHours(hour, minute, 0, 0);
    return date;
  });

  return (
    <View style={styles.wheelPickerWrap}>
      <DateTimePicker
        accentColor={colors.blue}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        mode="time"
        onValueChange={(_, nextTime) => {
          setSelectedTime(nextTime);
          onChange(new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(nextTime));
        }}
        textColor={colors.text}
        value={selectedTime}
      />
    </View>
  );
}

function TodayGoalPill({ goal, colors, onToggle }: { goal: Goal; colors: AppColors; onToggle: () => void }) {
  return (
    <Pressable accessibilityLabel={goal.completed ? `Mark ${goal.title} active` : `Mark ${goal.title} achieved`} onPress={onToggle} style={[styles.todayGoalPill, { backgroundColor: colors.yellowSoft }]}>
      <Text style={[styles.todayGoalPillStar, { color: colors.yellow }]}>{goal.completed ? '★' : '☆'}</Text>
      <Text numberOfLines={1} style={[styles.todayGoalPillText, { color: colors.yellow }, goal.completed && styles.completed]}>{goal.title}</Text>
    </Pressable>
  );
}

function InlineComposer({ kind, today, colors, initial, onCancel, onDraftChange, onReveal, onSave }: {
  kind: 'task' | 'event';
  today: string;
  colors: AppColors;
  initial?: PlanningItem;
  onCancel: () => void;
  onDraftChange?: (draft: ItemDraft) => void;
  onReveal: (y: number, height: number) => void;
  onSave: (draft: ItemDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [time, setTime] = useState(initial?.startTime ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [locationPlace, setLocationPlace] = useState<LocationPlace | undefined>(initial?.locationPlace);
  const [timeOpen, setTimeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const composerLayout = useRef({ y: 0, height: 0 });
  const composerFocused = useRef(false);
  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const fallbackGlass = colors.background === '#000000' ? 'rgba(38,38,42,0.88)' : 'rgba(246,246,250,0.84)';
  const glassTint = colors.background === '#000000' ? 'rgba(44,44,48,0.48)' : 'rgba(255,255,255,0.22)';

  useEffect(() => {
    if (!onDraftChange) return;
    onDraftChange({ id: initial?.id, kind, title, date: today, endDate: initial?.anchorEnd ?? undefined, precision: initial?.precision, altitude: initial?.altitude, eventType: initial?.eventType, time, endTime: initial?.endTime, notes, location, locationPlace });
  }, [initial?.altitude, initial?.anchorEnd, initial?.endTime, initial?.eventType, initial?.id, initial?.precision, kind, location, locationPlace, notes, onDraftChange, time, title, today]);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    await onSave({ id: initial?.id, kind, title, date: today, endDate: initial?.anchorEnd ?? undefined, precision: initial?.precision, altitude: initial?.altitude, eventType: initial?.eventType, time, endTime: initial?.endTime, notes, location, locationPlace });
  }

  function focusComposer() {
    composerFocused.current = true;
    setTimeout(() => onReveal(composerLayout.current.y, composerLayout.current.height), 20);
  }

  return (
    <View
      onLayout={(event) => {
        composerLayout.current = {
          y: event.nativeEvent.layout.y,
          height: event.nativeEvent.layout.height,
        };
        if (composerFocused.current) setTimeout(() => onReveal(composerLayout.current.y, composerLayout.current.height), 20);
      }}
      style={[
        styles.inlineComposer,
        { borderColor: colors.background === '#000000' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.72)' },
        !glassAvailable && { backgroundColor: fallbackGlass },
      ]}
    >
      {glassAvailable && <GlassView glassEffectStyle="regular" isInteractive style={styles.inlineComposerGlass} tintColor={glassTint} />}
      <TextInput
        autoFocus
        onChangeText={setTitle}
        onFocus={focusComposer}
        onSubmitEditing={() => kind === 'task' && void submit()}
        placeholder={kind === 'event' ? 'Event' : 'Task'}
        placeholderTextColor={colors.tertiary}
        returnKeyType={kind === 'task' ? 'done' : 'next'}
        style={[styles.inlineTitle, { color: colors.text, borderColor: colors.separator }]}
        value={title}
      />
      {kind === 'event' && (
        <>
          <Pressable onPress={() => {
            Keyboard.dismiss();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setTimeOpen((open) => !open);
            focusComposer();
          }} style={[styles.inlineTimeButton, { borderColor: colors.separator }]}>
            <Text style={[styles.inlineTimeValue, { color: time ? colors.text : colors.tertiary }]}>{time || 'Time'}</Text>
          </Pressable>
          {timeOpen && <InlineTimePicker colors={colors} onChange={setTime} value={time} />}
        </>
      )}
      <TextInput
        onChangeText={setNotes}
        onFocus={focusComposer}
        placeholder={kind === 'task' ? 'Subtext (optional)' : 'Notes (optional)'}
        placeholderTextColor={colors.tertiary}
        style={[styles.inlineField, { color: colors.text, borderColor: colors.separator }]}
        value={notes}
      />
      {kind === 'event' && (
        <LocationInput
          colors={colors}
          integrated
          onFocus={focusComposer}
          onPlaceChange={(place) => {
            setLocationPlace(place);
            setLocation(place.address);
          }}
          onTextChange={(text) => {
            setLocation(text);
            setLocationPlace(undefined);
          }}
          value={location}
        />
      )}
      {!initial && (
        <View style={styles.inlineActions}>
          <Pressable onPress={onCancel} hitSlop={8}><Text style={[styles.inlineAction, { color: colors.secondary }]}>Cancel</Text></Pressable>
          <Pressable disabled={!title.trim() || saving} onPress={() => void submit()} style={[styles.inlineSave, { backgroundColor: title.trim() ? colors.blue : colors.tertiary }]}>
            <Text style={styles.inlineSaveText}>{saving ? 'Saving…' : initial ? `Save ${kind}` : `Add ${kind}`}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ItemEditor({ initial, today, colors, onClose, onSave, onDelete }: {
  initial: EditorState;
  today: string;
  colors: AppColors;
  onClose: () => void;
  onSave: (draft: ItemDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const item = initial?.item;
  const [kind, setKind] = useState<'task' | 'event'>(initial?.kind ?? 'task');
  const [title, setTitle] = useState(item?.title ?? '');
  const [date, setDate] = useState(item?.anchorStart ?? today);
  const [time, setTime] = useState(item?.startTime ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [location, setLocation] = useState(item?.location ?? '');
  const [locationPlace, setLocationPlace] = useState<LocationPlace | undefined>(item?.locationPlace);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const initialMonth = dateFromISO(item?.anchorStart ?? today);
  const [visibleMonth, setVisibleMonth] = useState(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));
  const [saving, setSaving] = useState(false);
  const valid = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    await onSave({ id: item?.id, kind, title, date, endDate: item?.anchorEnd ?? undefined, precision: item?.precision, altitude: item?.altitude, eventType: item?.eventType, time, endTime: item?.endTime, notes, location, locationPlace });
  }

  function confirmDelete() {
    if (!item) return;
    Alert.alert(`Delete ${item.kind}?`, `“${item.title}” will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void onDelete(item.id) },
    ]);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={Boolean(initial)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.editor, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.editorSafe} edges={['top', 'bottom']}>
          <View style={styles.editorBar}>
            <Pressable onPress={onClose}><Text style={[styles.editorButton, { color: colors.blue }]}>Cancel</Text></Pressable>
            <Text style={[styles.editorHeading, { color: colors.text }]}>{item ? 'Edit' : 'New item'}</Text>
            <Pressable disabled={!valid || saving} onPress={() => void submit()}>
              <Text style={[styles.editorButton, { color: valid ? colors.blue : colors.tertiary, fontWeight: '700' }]}>{saving ? 'Saving' : 'Save'}</Text>
            </Pressable>
          </View>

          <ScrollView keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
          <View style={[styles.kindPicker, { backgroundColor: colors.card }]}>
            {(['task', 'event'] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setKind(option)}
                style={[styles.kindOption, kind === option && { backgroundColor: colors.background }]}
              >
                <Text style={[styles.kindText, { color: kind === option ? colors.text : colors.secondary }]}>
                  {option === 'task' ? 'Task' : 'Event'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.formCard, { backgroundColor: colors.card }]}>
            <TextInput
              autoFocus
              onChangeText={setTitle}
              placeholder={kind === 'task' ? 'Task' : 'Event'}
              placeholderTextColor={colors.tertiary}
              style={[styles.titleInput, { color: colors.text, borderColor: colors.separator }]}
              value={title}
            />
            <Pressable onPress={() => setDateOpen((open) => !open)} style={[styles.inputRow, { borderColor: colors.separator }]}>
              <Text style={[styles.inputLabel, { color: colors.secondary }]}>DATE</Text>
              <Text style={[styles.dateValue, { color: colors.text }]} numberOfLines={1}>{formatLongDate(date)}</Text>
              <Text style={[styles.dateChevron, { color: colors.blue }]}>{dateOpen ? '⌃' : '⌄'}</Text>
            </Pressable>
            {dateOpen && (
              <View style={styles.editorCalendar}>
                <MiniCalendar
                  colors={colors}
                  selected={date}
                  today={today}
                  visibleMonth={visibleMonth}
                  onChangeMonth={setVisibleMonth}
                  onSelect={(nextDate) => {
                    setDate(nextDate);
                    setDateOpen(false);
                  }}
                />
              </View>
            )}
            {kind === 'event' && (
              <>
                <Pressable onPress={() => {
                  Keyboard.dismiss();
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setTimeOpen((open) => !open);
                }} style={[styles.inputRow, { borderColor: colors.separator }]}>
                  <Text style={[styles.inputLabel, { color: colors.secondary }]}>TIME</Text>
                  <Text style={[styles.dateValue, { color: time ? colors.text : colors.tertiary }]}>{time || 'Choose a time'}</Text>
                </Pressable>
                {timeOpen && <View style={styles.editorWheel}><InlineTimePicker colors={colors} onChange={setTime} value={time} /></View>}
              </>
            )}
            <LabeledInput colors={colors} label="NOTES" multiline onChangeText={setNotes} placeholder="Optional details" value={notes} />
            {kind === 'event' && (
              <LocationInput
                colors={colors}
                labeled
                onPlaceChange={(place) => {
                  setLocationPlace(place);
                  setLocation(place.address);
                }}
                onTextChange={(text) => {
                  setLocation(text);
                  setLocationPlace(undefined);
                }}
                value={location}
              />
            )}
          </View>

          {item && (
            <Pressable onPress={confirmDelete} style={[styles.deleteButton, { backgroundColor: colors.card }]}>
              <Text style={[styles.deleteText, { color: colors.red }]}>Delete {item.kind}</Text>
            </Pressable>
          )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LocationInput({ value, colors, integrated, labeled, onFocus, onTextChange, onPlaceChange }: {
  value: string;
  colors: AppColors;
  integrated?: boolean;
  labeled?: boolean;
  onFocus?: () => void;
  onTextChange: (value: string) => void;
  onPlaceChange: (place: LocationPlace) => void;
}) {
  const [suggestions, setSuggestions] = useState<MapSuggestion[]>([]);
  const [resolving, setResolving] = useState(false);
  const [selectionCommitted, setSelectionCommitted] = useState(false);
  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const fallbackGlass = integrated
    ? colors.background === '#000000' ? 'rgba(38,38,42,0.88)' : 'rgba(246,246,250,0.84)'
    : colors.background === '#000000' ? 'rgba(36,36,40,0.88)' : 'rgba(250,250,252,0.88)';
  const suggestionTint = integrated
    ? colors.background === '#000000' ? 'rgba(44,44,48,0.48)' : 'rgba(255,255,255,0.22)'
    : colors.background === '#000000' ? 'rgba(44,44,48,0.55)' : 'rgba(255,255,255,0.36)';

  useEffect(() => {
    const query = value.trim();
    if (!CalendreamMapKit || query.length < 2 || resolving || selectionCommitted) return;
    let current = true;
    const timer = setTimeout(() => {
      void CalendreamMapKit.suggestAsync(query)
        .then((results) => { if (current) setSuggestions(results); })
        .catch(() => { if (current) setSuggestions([]); });
    }, 220);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [resolving, selectionCommitted, value]);

  async function selectSuggestion(suggestion: MapSuggestion) {
    if (!CalendreamMapKit) return;
    setResolving(true);
    setSuggestions([]);
    try {
      const query = [suggestion.title, suggestion.subtitle].filter(Boolean).join(', ');
      const place = await CalendreamMapKit.resolveAsync(query);
      setSelectionCommitted(true);
      onPlaceChange(place);
    } catch {
      Alert.alert('Location unavailable', 'Calendream could not resolve that place. Try another result.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <View style={suggestions.length > 0 && styles.locationLayerActive}>
      <View style={[labeled ? styles.inputRow : styles.locationInputRow, { borderColor: colors.separator }]}>
        {labeled && <Text style={[styles.inputLabel, { color: colors.secondary }]}>PLACE</Text>}
        <TextInput
          autoCorrect={false}
          onChangeText={(text) => {
            setSelectionCommitted(false);
            onTextChange(text);
            setSuggestions([]);
          }}
          onFocus={onFocus}
          placeholder={resolving ? 'Finding place…' : 'Location (optional)'}
          placeholderTextColor={colors.tertiary}
          style={[labeled ? styles.fieldInput : styles.locationInput, { color: colors.text }]}
          value={value}
        />
      </View>
      {suggestions.length > 0 && (
        <View style={[
          styles.locationSuggestions,
          labeled ? styles.locationSuggestionsLabeled : integrated ? styles.locationSuggestionsIntegrated : styles.locationSuggestionsInline,
          !glassAvailable && { backgroundColor: fallbackGlass },
        ]}>
          {glassAvailable && <GlassView glassEffectStyle="regular" style={[styles.locationSuggestionsGlass, integrated && styles.locationSuggestionsGlassIntegrated]} tintColor={suggestionTint} />}
          <View style={styles.locationSuggestionsContent}>
            {suggestions.map((suggestion, index) => (
              <Pressable
                key={`${suggestion.title}-${suggestion.subtitle}-${index}`}
                onPress={() => void selectSuggestion(suggestion)}
                style={[styles.locationSuggestion, index > 0 && { borderColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}
              >
                <Text style={[styles.locationSuggestionTitle, { color: colors.text }]} numberOfLines={1}>{suggestion.title}</Text>
                {!!suggestion.subtitle && <Text style={[styles.locationSuggestionSubtitle, { color: colors.secondary }]} numberOfLines={1}>{suggestion.subtitle}</Text>}
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function LabeledInput({ label, colors, multiline, ...props }: {
  label: string;
  colors: AppColors;
  multiline?: boolean;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={[styles.inputRow, multiline && styles.notesInputRow, { borderColor: colors.separator }]}>
      <Text style={[styles.inputLabel, { color: colors.secondary }]}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.tertiary}
        style={[styles.fieldInput, multiline && styles.notesField, { color: colors.text }]}
      />
    </View>
  );
}

function MorningBriefing({ visible, tasks, today, colors, onMoveTask, onSkip }: {
  visible: boolean;
  tasks: PlanningItem[];
  today: string;
  colors: AppColors;
  onMoveTask: (id: string, date: string) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState(addLocalDays(today, 1));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = dateFromISO(today);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  async function moveTask(id: string, date: string) {
    setSchedulingTaskId(null);
    setTargetDate(addLocalDays(today, 1));
    await onMoveTask(id, date);
  }

  async function moveAllToToday() {
    for (const task of tasks) await onMoveTask(task.id, today);
  }

  const glassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const fallbackGlass = colors.background === '#000000' ? 'rgba(24,24,27,0.85)' : 'rgba(250,250,252,0.85)';

  return (
    <Modal animationType="fade" onRequestClose={() => void onSkip()} presentationStyle="overFullScreen" statusBarTranslucent transparent visible={visible}>
      <View style={styles.briefingOverlay}>
        <Pressable accessibilityLabel="Close morning review" onPress={() => void onSkip()} style={StyleSheet.absoluteFill} />
        <View style={[styles.briefingSheet, schedulingTaskId && styles.briefingSheetExpanded, !glassAvailable && { backgroundColor: fallbackGlass, borderColor: colors.background === '#000000' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.9)' }]}>
          {glassAvailable && <GlassView glassEffectStyle="regular" style={StyleSheet.absoluteFill} />}
          <SafeAreaView style={styles.briefing} edges={['bottom']}>
        <View style={styles.briefingHeader}>
          <View style={styles.briefingTitleRow}>
            <View>
              <Text style={styles.briefingEyebrow}>GOOD MORNING</Text>
              <Text style={[styles.briefingTitle, { color: colors.text }]}>Yesterday’s {tasks.length === 1 ? 'task' : 'tasks'}</Text>
            </View>
            <Pressable accessibilityLabel="Skip unfinished task review for today" onPress={() => void onSkip()} hitSlop={12} style={[styles.reviewClose, { backgroundColor: colors.card }]}>
              <Text style={[styles.reviewCloseText, { color: colors.secondary }]}>×</Text>
            </Pressable>
          </View>
          <Text style={[styles.briefingBody, { color: colors.secondary }]}>A quick check-in before you begin. Give each unfinished task a home.</Text>
        </View>

        {tasks.length > 0 && (
          <ScrollView contentContainerStyle={styles.briefingContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.rolloverList, { backgroundColor: colors.card }]}>
              {tasks.map((task, index) => (
                <View key={task.id} style={[styles.rolloverRow, index > 0 && { borderColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={[styles.rolloverCheckbox, { borderColor: colors.tertiary }]} />
                  <View style={styles.rolloverCopy}>
                    <Text style={[styles.rolloverTitle, { color: colors.text }]}>{task.title}</Text>
                    <Text style={[styles.rolloverDate, { color: colors.secondary }]}>Left from {formatShortDate(task.anchorStart)}</Text>
                    {task.notes && <Text numberOfLines={1} style={[styles.rolloverNotes, { color: colors.secondary }]}>{task.notes}</Text>}
                  </View>
                  <Pressable accessibilityLabel={`Schedule ${task.title} for another day`} hitSlop={8} onPress={() => { setSchedulingTaskId(task.id); setTargetDate(addLocalDays(today, 1)); }} style={[styles.scheduleTaskButton, { backgroundColor: colors.blueSoft }]}>
                    <SymbolView name="chevron.right" size={14} tintColor={colors.blue} weight="semibold" />
                  </Pressable>
                </View>
              ))}
            </View>

            {schedulingTaskId && (
              <MiniCalendar
                colors={colors}
                selected={targetDate}
                today={today}
                visibleMonth={visibleMonth}
                onChangeMonth={setVisibleMonth}
                onSelect={setTargetDate}
              />
            )}

            {schedulingTaskId && (
              <View style={styles.calendarFooter}>
                <Pressable onPress={() => setSchedulingTaskId(null)} style={styles.calendarCancel}>
                  <Text style={[styles.reviewSecondaryText, { color: colors.secondary }]}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => void moveTask(schedulingTaskId, targetDate)} style={[styles.calendarConfirm, { backgroundColor: colors.blue }]}>
                  <Text style={styles.reviewPrimaryText}>Move to {formatDestination(targetDate)}</Text>
                </Pressable>
              </View>
            )}
            {!schedulingTaskId && (
              <Pressable onPress={() => void moveAllToToday()} style={[styles.reviewPrimary, { backgroundColor: colors.blue }]}>
                <Text style={styles.reviewPrimaryText}>Move all to Today</Text>
              </Pressable>
            )}
            <Pressable onPress={() => void onSkip()} style={styles.skipTodayButton}>
              <Text style={[styles.skipTodayText, { color: colors.secondary }]}>Skip for today</Text>
              <Text style={[styles.skipTodaySubtext, { color: colors.tertiary }]}>Leave the remaining tasks in the past</Text>
            </Pressable>
          </ScrollView>
        )}
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

function MiniCalendar({ colors, selected, today, visibleMonth, onChangeMonth, onSelect }: {
  colors: AppColors;
  selected: string;
  today: string;
  visibleMonth: Date;
  onChangeMonth: (date: Date) => void;
  onSelect: (date: string) => void;
}) {
  const quickDates = Array.from({ length: 5 }, (_, index) => addLocalDays(today, index + 1));
  const firstWeekday = weekdayOffset(visibleMonth.getDay());
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(visibleMonth);
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);

  return (
    <View style={[styles.calendarCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.quickLabel, { color: colors.secondary }]}>QUICK PICK</Text>
      <View style={styles.quickDays}>
        {quickDates.map((isoDate) => {
          const date = dateFromISO(isoDate);
          const active = isoDate === selected;
          return (
            <Pressable key={isoDate} onPress={() => onSelect(isoDate)} style={[styles.quickDay, { backgroundColor: active ? colors.blue : colors.background }]}>
              <Text style={[styles.quickWeekday, { color: active ? '#FFFFFF' : colors.secondary }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)}</Text>
              <Text style={[styles.quickNumber, { color: active ? '#FFFFFF' : colors.text }]}>{date.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.monthHeader}>
        <Text style={[styles.monthTitle, { color: colors.text }]}>{monthTitle}</Text>
        <View style={styles.monthControls}>
          <Pressable hitSlop={8} onPress={() => onChangeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}><Text style={[styles.monthArrow, { color: colors.blue }]}>‹</Text></Pressable>
          <Pressable hitSlop={8} onPress={() => onChangeMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}><Text style={[styles.monthArrow, { color: colors.blue }]}>›</Text></Pressable>
        </View>
      </View>
      <View style={styles.calendarGrid}>
        {orderedWeekdayLabels().map((label, index) => <Text key={`${label}-${index}`} style={[styles.weekdayLabel, { color: colors.tertiary }]}>{label}</Text>)}
        {cells.map((day, index) => {
          if (!day) return <View key={`blank-${index}`} style={styles.calendarCell} />;
          const isoDate = localISO(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
          const disabled = isoDate < today;
          const active = isoDate === selected;
          const isToday = isoDate === today;
          return (
            <Pressable key={isoDate} disabled={disabled} onPress={() => onSelect(isoDate)} style={styles.calendarCell}>
              <View style={[styles.calendarDay, isToday && { borderColor: colors.red, borderWidth: 1.5 }, active && { backgroundColor: colors.blue, borderWidth: 0 }]}>
                <Text style={[styles.calendarNumber, { color: disabled ? colors.tertiary : active ? '#FFFFFF' : colors.text }]}>{day}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  pressed: { opacity: 0.6 },
  topBar: { position: 'relative', zIndex: 60, height: 44, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateStripFrame: { height: 76, borderBottomWidth: StyleSheet.hairlineWidth },
  dateStripContent: { paddingHorizontal: 18, alignItems: 'center' },
  todayMorph: { height: 75, overflow: 'hidden' },
  todayMorphButton: { flex: 1 },
  expandedToday: { position: 'absolute', left: 0, top: 0, width: 210, height: 75, paddingLeft: 18, justifyContent: 'center' },
  collapsedToday: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  compactEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 0.9, marginBottom: 3 },
  compactDateTitle: { fontSize: 19, lineHeight: 22, fontWeight: '700', letterSpacing: -0.45 },
  dayRailItem: { width: 48, alignItems: 'center', gap: 3 },
  dayRailLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 0.35 },
  dayRailOrb: { width: 34, height: 34, borderRadius: 17, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dayRailNumber: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dayPage: { flex: 1 },
  wordmark: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  calendarButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  searchOrb: { flex: 1, height: 34, borderRadius: 17, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, height: 34, fontSize: 15, paddingVertical: 0 },
  addButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' },
  addSymbol: { color: '#FFFFFF', fontSize: 24, lineHeight: 25, fontWeight: '400' },
  scrollContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 104 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  date: { fontSize: 31, fontWeight: '700', letterSpacing: -1, marginTop: 3 },
  daySummary: { fontSize: 14, marginTop: 3 },
  upcomingScroller: { marginHorizontal: -18, marginBottom: 10 },
  upcomingList: { paddingHorizontal: 18, gap: 7 },
  upcomingPill: { minHeight: 28, borderRadius: 14, paddingHorizontal: 11, justifyContent: 'center', maxWidth: 260 },
  upcomingText: { fontSize: 13, fontWeight: '600' },
  goalReminderScroller: { marginHorizontal: -18, marginTop: -3, marginBottom: 10 },
  goalReminderList: { paddingHorizontal: 18, gap: 7 },
  todayGoalPill: { minHeight: 28, maxWidth: 260, borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  todayGoalPillStar: { fontSize: 15, lineHeight: 17, fontWeight: '700' },
  todayGoalPillText: { flexShrink: 1, fontSize: 13, fontWeight: '600' },
  upNextCard: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  cardEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  upNextTitle: { fontSize: 19, fontWeight: '700', marginTop: 4, letterSpacing: -0.3 },
  upNextMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  loader: { paddingVertical: 40 },
  sectionHeader: { marginTop: 5, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  sectionAction: { fontSize: 14, fontWeight: '600' },
  eventRow: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  eventTime: { width: 68, fontSize: 13, fontVariant: ['tabular-nums'] },
  eventRule: { width: 3, height: 27, borderRadius: 2, marginRight: 11 },
  habitEventCheckIn: { minHeight: 49, borderRadius: 15, marginLeft: 68, marginTop: 5, marginBottom: 7, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  habitEventQuestion: { fontSize: 12, lineHeight: 15, fontWeight: '700' },
  habitEventMeta: { fontSize: 9, lineHeight: 12, marginTop: 1 },
  habitEventChoice: { minWidth: 38, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  habitEventChoiceText: { fontSize: 11, fontWeight: '800' },
  habitEventMissed: { marginLeft: 68, marginTop: 4, marginBottom: 5, fontSize: 10 },
  mapsButton: { height: 28, borderRadius: 14, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  mapsButtonText: { fontSize: 12, fontWeight: '700' },
  rowCopy: { flex: 1, paddingVertical: 6 },
  rowTitle: { fontSize: 16, fontWeight: '500', letterSpacing: -0.15 },
  rowNote: { fontSize: 12, marginTop: 2 },
  taskRow: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  taskCopy: { flex: 1, paddingVertical: 8 },
  completed: { textDecorationLine: 'line-through' },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingTop: 8, paddingBottom: 20 },
  tabButton: { flex: 1, alignItems: 'center', gap: 4 },
  tabGlyph: { width: 23, height: 16, borderRadius: 6 },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  editor: { flex: 1 },
  editorSafe: { flex: 1 },
  editorBar: { height: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorHeading: { fontSize: 16, fontWeight: '700' },
  editorButton: { fontSize: 16 },
  inlineComposer: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, paddingBottom: 11, marginTop: 8, zIndex: 20, shadowColor: '#000000', shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  inlineComposerGlass: { position: 'absolute', inset: 0, borderRadius: 18 },
  inlineTitle: { height: 48, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 17, fontWeight: '600' },
  inlineField: { height: 42, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 15 },
  locationInputRow: { minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  locationInput: { minHeight: 42, fontSize: 15 },
  locationLayerActive: { zIndex: 100 },
  locationSuggestions: { position: 'absolute', left: 0, right: 0, borderRadius: 16, overflow: 'hidden', zIndex: 100, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 14 },
  locationSuggestionsInline: { top: 48 },
  locationSuggestionsIntegrated: { top: 41, left: -13, right: -13, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  locationSuggestionsLabeled: { top: 54 },
  locationSuggestionsGlass: { position: 'absolute', inset: 0, borderRadius: 16 },
  locationSuggestionsGlassIntegrated: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  locationSuggestionsContent: { paddingHorizontal: 5, paddingVertical: 5 },
  locationSuggestion: { minHeight: 48, paddingHorizontal: 11, paddingVertical: 7, justifyContent: 'center' },
  locationSuggestionTitle: { fontSize: 14, fontWeight: '600' },
  locationSuggestionSubtitle: { fontSize: 11, marginTop: 2 },
  inlineTimeButton: { height: 44, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center' },
  inlineTimeValue: { flex: 1, fontSize: 15, fontWeight: '500' },
  wheelPickerWrap: { height: 168, overflow: 'hidden', justifyContent: 'center' },
  inlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 10 },
  inlineAction: { fontSize: 14, fontWeight: '600' },
  inlineSave: { height: 34, borderRadius: 10, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  inlineSaveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  kindPicker: { flexDirection: 'row', marginHorizontal: 18, marginTop: 12, padding: 3, borderRadius: 10 },
  kindOption: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  kindText: { fontSize: 14, fontWeight: '600' },
  formCard: { marginHorizontal: 18, marginTop: 18, borderRadius: 14, overflow: 'hidden' },
  titleInput: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 18, fontWeight: '600' },
  inputRow: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  notesInputRow: { minHeight: 94, alignItems: 'flex-start', paddingTop: 14 },
  inputLabel: { width: 58, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  dateValue: { flex: 1, fontSize: 15, fontWeight: '500' },
  dateChevron: { fontSize: 18, marginLeft: 6 },
  editorCalendar: { paddingHorizontal: 10, paddingBottom: 10 },
  editorWheel: { paddingHorizontal: 10 },
  fieldInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  notesField: { minHeight: 72, textAlignVertical: 'top', paddingTop: 0 },
  deleteButton: { height: 50, marginHorizontal: 18, marginTop: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 16, fontWeight: '600' },
  briefingOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.08)' },
  briefingSheet: { maxHeight: '60%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
  briefingSheetExpanded: { height: '88%', maxHeight: '88%' },
  briefing: { flexShrink: 1 },
  briefingHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 },
  briefingTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  briefingEyebrow: { color: '#FF9F0A', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  briefingTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.8, marginTop: 3 },
  briefingBody: { fontSize: 14, lineHeight: 19, marginTop: 6, maxWidth: 360 },
  reviewClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  reviewCloseText: { fontSize: 25, lineHeight: 27, fontWeight: '400' },
  briefingContent: { paddingHorizontal: 18, paddingBottom: 12 },
  rolloverList: { borderRadius: 18, paddingHorizontal: 14, overflow: 'hidden' },
  rolloverRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  rolloverCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, marginRight: 11 },
  rolloverCopy: { flex: 1, paddingRight: 8 },
  rolloverDate: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  rolloverTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.15 },
  rolloverNotes: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  scheduleTaskButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  reviewPrimary: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  reviewPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  reviewSecondaryText: { fontSize: 15, fontWeight: '600' },
  calendarCard: { borderRadius: 18, padding: 14, marginTop: 12 },
  quickLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginBottom: 8 },
  quickDays: { flexDirection: 'row', gap: 7 },
  quickDay: { flex: 1, height: 54, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  quickWeekday: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  quickNumber: { fontSize: 17, fontWeight: '700', marginTop: 2 },
  monthHeader: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  monthTitle: { fontSize: 16, fontWeight: '700' },
  monthControls: { flexDirection: 'row', gap: 22, paddingRight: 5 },
  monthArrow: { fontSize: 28, lineHeight: 30, fontWeight: '400' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekdayLabel: { width: '14.285%', textAlign: 'center', fontSize: 10, fontWeight: '700', height: 25 },
  calendarCell: { width: '14.285%', height: 36, alignItems: 'center', justifyContent: 'center' },
  calendarDay: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  calendarNumber: { fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] },
  calendarFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  calendarCancel: { height: 46, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  calendarConfirm: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  skipTodayButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 15, marginTop: 4 },
  skipTodayText: { fontSize: 14, fontWeight: '600' },
  skipTodaySubtext: { fontSize: 11, marginTop: 3 },
});
