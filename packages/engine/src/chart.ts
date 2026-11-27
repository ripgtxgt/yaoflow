import { calendarContextAt, strengthOf, type CalendarOptions } from "./calendar";
import { hexagramShape, lineChanges, type LineChange } from "./changes";
import { najiaFor } from "./najia";
import { resolveCast } from "./cast";
import { palaceOf, relationsFor, spiritsForDay } from "./palace";
import { clashes, combines } from "./relations";
import type {
  Branch, CalendarContext, CastResult, LineValue, PalaceInfo, Relation, Spirit, Strength,
} from "./types";

export interface ChartLine {
  position: number;
  value: LineValue;
  polarity: "yin" | "yang";
  changing: boolean;
  stem: string;
  branch: Branch;
  phase: string;
  relation: Relation;
  spirit: Spirit;
  strength: Strength;
  isWorld: boolean;
  isResponse: boolean;
  /** 旬空. */
  isVoid: boolean;
  /** 月破: clashes the month branch. */
  monthClash: boolean;
  /** 日冲: clashes the day branch. */
  dayClash: boolean;
  /** 合日/合月 flags for reference. */
  monthCombine: boolean;
  dayCombine: boolean;
}

export type HexShape = ReturnType<typeof hexagramShape>;

export interface FullChart {
  cast: CastResult;
  palace: PalaceInfo;
  calendar: CalendarContext;
  lines: ChartLine[];
  /** 动变关系 per moving line (empty when nothing moves). */
  changes: LineChange[];
  /** 六冲 / 六合 shape of the primary and (if any) transformed hexagram. */
  shape: { primary: HexShape; changed: HexShape };
}

export interface ChartInput {
  values: readonly LineValue[];
  /** Cast instant as Unix epoch ms (UTC). */
  utcMs: number;
  /** Local timezone offset in minutes east of UTC (e.g. Beijing = 480). */
  tzOffsetMinutes: number;
  options?: CalendarOptions;
}

/**
 * The complete deterministic Liu Yao chart: cast + najia + palace/世应 +
 * 六亲 + 六神 + calendar layer (旬空/月破/日冲/旺衰).
 * This JSON is the single source of truth handed to the AI layer.
 */
export function fullChart(input: ChartInput): FullChart {
  const cast = resolveCast(input.values);
  const palace = palaceOf(cast.primary.number);
  const calendar = calendarContextAt(input.utcMs, input.tzOffsetMinutes, input.options);
  const relations = relationsFor(cast.primary.number, cast.primary.lower, cast.primary.upper);
  const spirits = spiritsForDay(calendar.day.stem);

  const lines: ChartLine[] = cast.lines.map((l, i) => {
    const nj = cast.najia[i]!;
    return {
      position: l.position,
      value: l.value,
      polarity: l.polarity,
      changing: l.changing,
      stem: nj.stem,
      branch: nj.branch,
      phase: nj.phase,
      relation: relations[i]!,
      spirit: spirits[i]!,
      strength: strengthOf(nj.phase, calendar.month.branch),
      isWorld: l.position === palace.world,
      isResponse: l.position === palace.response,
      isVoid: calendar.voidBranches.includes(nj.branch),
      monthClash: clashes(nj.branch, calendar.month.branch),
      dayClash: clashes(nj.branch, calendar.day.branch),
      monthCombine: combines(nj.branch, calendar.month.branch),
      dayCombine: combines(nj.branch, calendar.day.branch),
    };
  });

  const changes = lineChanges(cast, palace, calendar, lines);
  const shape = {
    primary: hexagramShape(cast.najia),
    changed: cast.changed ? hexagramShape(najiaFor(cast.changed.lower, cast.changed.upper)) : null,
  };
  return { cast, palace, calendar, lines, changes, shape };
}
