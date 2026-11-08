/**
 * Pedif Command Stack
 * Lightweight Command Pattern implementation for bounded Undo / Redo history.
 */

export class CommandStack {
  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  /**
   * Execute a command and push it to undo stack
   * @param {Object} command - { execute: () => void, undo: () => void, description?: string }
   */
  execute(command) {
    if (typeof command.execute === 'function') {
      command.execute();
    }
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    // Clear redo stack on new action
    this.redoStack = [];
    this._notify();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return false;
    const command = this.undoStack.pop();
    if (typeof command.undo === 'function') {
      command.undo();
    }
    this.redoStack.push(command);
    this._notify();
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    const command = this.redoStack.pop();
    if (typeof command.execute === 'function') {
      command.execute();
    }
    this.undoStack.push(command);
    this._notify();
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this._notify();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    const state = {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
    };
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.error('[CommandStack] Listener error:', e);
      }
    }
  }
}

export const commandStack = new CommandStack(50);
