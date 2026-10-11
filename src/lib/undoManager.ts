import { setDoc } from "../lib/firebase";
import { safeGetItemLocal } from "./storage";
import { db, APP_ID } from "./firebase";
import { collection, doc } from 'firebase/firestore';

export interface UndoAction {
  description: string;
  revert: () => Promise<void>;
  redo?: () => Promise<void>;
  timestamp?: number;
}

type Listener = (undoStack: UndoAction[], redoStack: UndoAction[]) => void;

let stack: UndoAction[] = [];
let redoStack: UndoAction[] = [];
let listeners: Listener[] = [];
let currentBatch: UndoAction[] | null = null;
let currentBatchDescription = "";

export const logUserAction = async (description: string) => {
  try {
    const authData = safeGetItemLocal("taka_auth_v1");
    if (!authData) return;
    const user = JSON.parse(authData);
    if (!user || !user.id || user.role === "guest") return;

    const logRef = doc(
      collection(db, "artifacts", APP_ID, "public", "data", "taka_action_logs"),
    );
    setDoc(logRef, {
      userId: user.id,
      username: user.username,
      role: user.role,
      description,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to log action", e);
  }
};

export const undoManager = {
  startBatch: (description: string) => {
    if (currentBatch) {
      console.warn("A batch is already in progress. Committing it first.");
      undoManager.commitBatch();
    }
    currentBatch = [];
    currentBatchDescription = description;
  },

  commitBatch: (skipLog?: boolean) => {
    if (!currentBatch) return;
    if (currentBatch.length === 0) {
      currentBatch = null;
      return;
    }
    const actionsToRevert = [...currentBatch];
    const batchedAction: UndoAction = {
      description: currentBatchDescription,
      timestamp: Date.now(),
      revert: async () => {
        for (let i = actionsToRevert.length - 1; i >= 0; i--) {
          await actionsToRevert[i].revert();
        }
      },
      redo: async () => {
        for (let i = 0; i < actionsToRevert.length; i++) {
          if (actionsToRevert[i].redo) {
            await actionsToRevert[i].redo!();
          }
        }
      }
    };
    currentBatch = null;
    undoManager.push(batchedAction, skipLog);
  },

  cancelBatch: () => {
    currentBatch = null;
  },

  push: (action: UndoAction, skipLog?: boolean) => {
    if (currentBatch) {
      currentBatch.push(action);
      return;
    }
    if (!action.timestamp) {
      action.timestamp = Date.now();
    }
    stack.push(action);
    if (stack.length > 50) stack.shift(); // Keep last 50 actions in multi-level stack
    
    // Clear redo stack on any new user action (standard undo/redo command pattern)
    redoStack = [];
    
    notify();
    if (!skipLog) {
      logUserAction(action.description);
    }
  },

  pop: async () => {
    const action = stack.pop();
    if (action) {
      notify();
      try {
        await action.revert();
        redoStack.push(action);
        if (redoStack.length > 50) redoStack.shift();
        notify();
        logUserAction(`Undo: ${action.description}`);
      } catch (e) {
        console.error("Failed to revert action:", e);
      }
    }
  },

  redo: async () => {
    const action = redoStack.pop();
    if (action) {
      notify();
      try {
        if (action.redo) {
          await action.redo();
        }
        stack.push(action);
        if (stack.length > 50) stack.shift();
        notify();
        logUserAction(`Redo: ${action.description}`);
      } catch (e) {
        console.error("Failed to redo action:", e);
      }
    }
  },

  canUndo: () => stack.length > 0,
  canRedo: () => redoStack.length > 0,

  getStack: () => stack,
  getRedoStack: () => redoStack,

  clear: () => {
    stack = [];
    redoStack = [];
    currentBatch = null;
    notify();
  },

  subscribe: (listener: Listener) => {
    listener([...stack], [...redoStack]);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};

function notify() {
  const currentStack = [...stack];
  const currentRedoStack = [...redoStack];
  listeners.forEach((l) => l(currentStack, currentRedoStack));
}
