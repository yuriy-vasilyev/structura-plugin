import { ReadingLevelOption, ToneOption } from "./types";
import { READING_LEVEL_OPTIONS, TONE_OPTIONS } from "./data/personaTemplates";

export const getToneColor = (tone: ToneOption) => {
  switch (tone.toLowerCase()) {
    case "professional":
      return {
        background: "bg-blue-100 dark:bg-blue-900/10",
        text: "text-blue-800 dark:text-blue-200",
        border: "border-blue-200 dark:border-blue-700/50",
        progress: "bg-blue-500/80",
      };
    case "casual":
      return {
        background: "bg-green-100 dark:bg-green-900/10",
        text: "text-green-800 dark:text-green-200",
        border: "border-green-200 dark:border-green-700/50",
        progress: "bg-green-500/80",
      };
    case "humorous":
      return {
        background: "bg-yellow-100 dark:bg-yellow-900/10",
        text: "text-yellow-800 dark:text-yellow-200",
        border: "border-yellow-200 dark:border-yellow-700/50",
        progress: "bg-yellow-500/80",
      };
    case "authoritative":
      return {
        background: "bg-red-100 dark:bg-red-900/10",
        text: "text-red-800 dark:text-red-200",
        border: "border-red-200 dark:border-red-700/50",
        progress: "bg-red-500/80",
      };
    case "enthusiastic":
      return {
        background: "bg-purple-100 dark:bg-purple-900/10",
        text: "text-purple-800 dark:text-purple-200",
        border: "border-purple-200 dark:border-purple-700/50",
        progress: "bg-purple-500/80",
      };
    case "empathetic":
      return {
        background: "bg-pink-100 dark:bg-pink-900/10",
        text: "text-pink-800 dark:text-pink-200",
        border: "border-pink-200 dark:border-pink-700/50",
        progress: "bg-pink-500/80",
      };
    case "controversial":
      return {
        background: "bg-gray-100 dark:bg-gray-900/10",
        text: "text-gray-800 dark:text-gray-200",
        border: "border-gray-200 dark:border-gray-700/50",
        progress: "bg-gray-500/80",
      };
    default:
      return {
        background: "bg-gray-100 dark:bg-gray-900/10",
        text: "text-gray-800 dark:text-gray-200",
        border: "border-gray-200 dark:border-gray-700/50",
        progress: "bg-gray-500/80",
      };
  }
};

export const getReadingLevelColor = (level: ReadingLevelOption) => {
  switch (level.toLowerCase()) {
    case "grade_5":
      return {
        background: "bg-blue-100 dark:bg-blue-900/10",
        text: "text-blue-800 dark:text-blue-200",
        border: "border-blue-200 dark:border-blue-700/50",
        progress: "bg-blue-500/80",
      };
    case "grade_8":
      return {
        background: "bg-green-100 dark:bg-green-900/10",
        text: "text-green-800 dark:text-green-200",
        border: "border-green-200 dark:border-green-700/50",
        progress: "bg-green-500/80",
      };
    case "grade_12":
      return {
        background: "bg-yellow-100 dark:bg-yellow-900/10",
        text: "text-yellow-800 dark:text-yellow-200",
        border: "border-yellow-200 dark:border-yellow-700/50",
        progress: "bg-yellow-500/80",
      };
    case "phd":
      return {
        background: "bg-pink-100 dark:bg-pink-900/10",
        text: "text-pink-800 dark:text-pink-200",
        border: "border-pink-200 dark:border-pink-700/50",
        progress: "bg-pink-500/80",
      };
    default:
      return {
        background: "bg-gray-100 dark:bg-gray-900/10",
        text: "text-gray-800 dark:text-gray-200",
        border: "border-gray-200 dark:border-gray-700/50",
        progress: "bg-gray-500/80",
      };
  }
};

export const getReadingLevelLabel = (level: ReadingLevelOption) =>
  READING_LEVEL_OPTIONS.find((l) => l.value === level)?.label || level;

export const getToneLabel = (tone: ToneOption) =>
  TONE_OPTIONS.find((t) => t.value === tone)?.label || tone;

export const getReadingLevelProgress = (level: ReadingLevelOption) => {
  switch (level.toLowerCase()) {
    case "grade_5":
      return 25;
    case "grade_8":
      return 50;
    case "grade_12":
      return 75;
    case "phd":
      return 100;
    default:
      return 0;
  }
};
