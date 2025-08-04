interface TodoDatabase {
  [username: string]: string[];
}

const db: TodoDatabase = {};

export const getTodos = (username: string): string[] => db[username] || [];

export const createTodo = (username: string, todo: string): string => {
  if (!db[username]) db[username] = [];
  db[username].push(todo);
  return todo;
};

export const deleteTodo = (username: string, index: number): boolean => {
  if (!db[username] || index < 0 || index >= db[username].length) return false;
  db[username].splice(index, 1);
  return true;
};
