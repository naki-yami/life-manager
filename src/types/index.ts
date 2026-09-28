// Task types for today plan
export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'completed';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string;
  createdAt: string;
  completedAt?: string;
}

// Book types
export type BookStatus = 'want-to-read' | 'reading' | 'finished';

export interface BookNote {
  id: string;
  content: string;
  createdAt: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  status: BookStatus;
  progress: number;
  notes: BookNote[];
  createdAt: string;
}

// Dev project types
export type DevProjectStatus = 'planning' | 'in-progress' | 'completed' | 'paused';
export type DevTaskStatus = 'todo' | 'in-progress' | 'done';

export interface DevTask {
  id: string;
  title: string;
  status: DevTaskStatus;
  priority: Priority;
  createdAt: string;
}

export interface DevProject {
  id: string;
  name: string;
  description: string;
  status: DevProjectStatus;
  tasks: DevTask[];
  createdAt: string;
}

// Writing types
export type WritingType = 'article' | 'copy' | 'book';
export type WritingStatus = 'draft' | 'in-progress' | 'completed';

export interface WritingProject {
  id: string;
  title: string;
  type: WritingType;
  status: WritingStatus;
  wordCount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// Fitness types
export interface Exercise {
  id?: string;
  name: string;
  sets: number;
  reps: number;
  weight: number;
}

export interface WorkoutRecord {
  id: string;
  date: string;
  planName: string;
  exercises: Exercise[];
  notes: string;
  createdAt: string;
}

export interface FitnessPlan {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

// Diet types
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodItem {
  id?: string;
  name: string;
  category: string;
  calories: number;
}

export interface MealRecord {
  id: string;
  date: string;
  type: MealType;
  items: FoodItem[];
  totalCalories: number;
}

// Game types
export type GamePlatform = 'PC' | 'PS5' | 'Xbox' | 'Switch' | 'Mobile' | 'Other';
export type GameStatus = 'playing' | 'completed' | 'backlog';

export interface GameAchievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
}

export interface Game {
  id: string;
  name: string;
  platform: GamePlatform;
  status: GameStatus;
  hoursPlayed: number;
  progress: number;
  achievements: GameAchievement[];
  notes: string;
  createdAt: string;
}

// Memo types
export interface Memo {
  id: string;
  content: string;
  createdAt: string;
}
