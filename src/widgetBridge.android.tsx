import {
  FlexWidget,
  ListWidget,
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  TextWidget,
  WidgetTaskHandler,
} from 'react-native-android-widget';

import {
  Checklist,
  clearTicks,
  createChecklist,
  doneCount,
  formatDay,
  hasTicks,
  isResetDue,
  Item,
  reminderTime,
  taskCount,
  toggleItem,
} from './checklist';
import { syncReminder } from './reminder';
import { loadChecklist, saveChecklist } from './storage';
import { TEXT_COLORS, ThemeName, THEMES } from './theme';

const LIST_WIDGET = 'ChecklistList';
const SUMMARY_WIDGET = 'ChecklistSummary';
const TOGGLE_ACTION = 'TOGGLE_ITEM';
const CLEAR_ACTION = 'CLEAR_TICKS';

type Hex = `#${string}`;

function palette(theme: ThemeName) {
  return THEMES[theme] as { [Key in keyof typeof THEMES.light]: Hex };
}

function statusLine(list: Checklist): string {
  const tasks = taskCount(list);
  return tasks > 0 ? `Выполнено ${doneCount(list)} из ${tasks}` : 'Нет строк с галочками';
}

function clearIsOffered(list: Checklist): boolean {
  return isResetDue(list, Date.now()) && hasTicks(list);
}

function ClearButton({ theme }: { theme: ThemeName }) {
  const colors = palette(theme);
  return (
    <TextWidget
      text="Снять все галочки"
      clickAction={CLEAR_ACTION}
      style={{
        marginTop: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: colors.accent,
        color: colors.onAccent,
        fontSize: 14,
        fontWeight: '600',
      }}
    />
  );
}

function ListRow({ item, theme }: { item: Item; theme: ThemeName }) {
  const colors = palette(theme);
  const rowColor = item.color ? TEXT_COLORS[theme][item.color] : colors.text;
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 2,
      }}
    >
      {item.kind !== 'text' && (
        <TextWidget
          text={item.done ? '☑' : '☐'}
          clickAction={TOGGLE_ACTION}
          clickActionData={{ id: item.id }}
          accessibilityLabel={item.title}
          style={{
            paddingRight: 10,
            paddingVertical: 4,
            fontSize: 22,
            color: item.done ? colors.accent : colors.muted,
          }}
        />
      )}
      <TextWidget
        text={item.title.split('\n')[0]}
        clickAction="OPEN_APP"
        maxLines={1}
        truncate="END"
        style={{
          width: 'match_parent',
          fontSize: 15,
          color: item.done && !item.color ? colors.muted : rowColor,
        }}
      />
    </FlexWidget>
  );
}

function ChecklistListWidget({ list, theme }: { list: Checklist; theme: ThemeName }) {
  const colors = palette(theme);
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        padding: 12,
        borderRadius: 16,
        backgroundColor: colors.background,
      }}
    >
      <TextWidget
        text={statusLine(list)}
        clickAction="OPEN_APP"
        style={{ width: 'match_parent', fontSize: 13, color: colors.muted, marginBottom: 4 }}
      />
      {clearIsOffered(list) && <ClearButton theme={theme} />}
      {list.items.length > 0 ? (
        <ListWidget style={{ width: 'match_parent', height: 'match_parent', marginTop: 4 }}>
          {list.items.map((item) => (
            <ListRow key={item.id} item={item} theme={theme} />
          ))}
        </ListWidget>
      ) : (
        <TextWidget
          text="Откройте приложение и добавьте строку"
          clickAction="OPEN_APP"
          style={{ width: 'match_parent', fontSize: 15, color: colors.text, marginTop: 4 }}
        />
      )}
    </FlexWidget>
  );
}

function ChecklistSummaryWidget({ list, theme }: { list: Checklist; theme: ThemeName }) {
  const colors = palette(theme);
  const due = isResetDue(list, Date.now());
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        justifyContent: 'center',
        padding: 10,
        borderRadius: 16,
        backgroundColor: colors.background,
      }}
    >
      <TextWidget
        text={statusLine(list)}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 15, fontWeight: '600', color: colors.text }}
      />
      {clearIsOffered(list) ? (
        <ClearButton theme={theme} />
      ) : (
        !due && (
          <TextWidget
            text={`Напоминание: ${formatDay(list.nextResetAt)}`}
            maxLines={1}
            truncate="END"
            style={{ marginTop: 2, fontSize: 13, color: colors.muted }}
          />
        )
      )}
    </FlexWidget>
  );
}

function render(widgetName: string, list: Checklist) {
  const Widget = widgetName === SUMMARY_WIDGET ? ChecklistSummaryWidget : ChecklistListWidget;
  return {
    light: <Widget list={list} theme="light" />,
    dark: <Widget list={list} theme="dark" />,
  };
}

const handler: WidgetTaskHandler = async ({
  widgetInfo,
  widgetAction,
  clickAction,
  clickActionData,
  renderWidget,
}) => {
  if (widgetAction === 'WIDGET_DELETED') return;

  let list = (await loadChecklist()) ?? createChecklist(Date.now());
  if (widgetAction === 'WIDGET_CLICK') {
    const before = list;
    if (clickAction === TOGGLE_ACTION && typeof clickActionData?.id === 'string') {
      list = toggleItem(list, clickActionData.id, Date.now());
    } else if (clickAction === CLEAR_ACTION) {
      list = clearTicks(list, Date.now());
    }
    if (list !== before) {
      await saveChecklist(list);
      updateWidgets(list);
      const at = hasTicks(list) ? reminderTime(list, Date.now()) : null;
      await syncReminder(at, { ask: false }).catch(() => {});
    }
  }
  renderWidget(render(widgetInfo.widgetName, list));
};

export function registerWidgets(): void {
  registerWidgetTaskHandler(handler);
}

export function updateWidgets(list: Checklist): void {
  for (const widgetName of [LIST_WIDGET, SUMMARY_WIDGET]) {
    requestWidgetUpdate({ widgetName, renderWidget: () => render(widgetName, list) }).catch(() => {});
  }
}
