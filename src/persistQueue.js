// Simple in-process persistence queue for deferred DB writes.
// Not durable across process restarts; intended only to reduce perceived latency.

const queue = [];
let working = false;
let started = false;

function enqueue(task) {
  queue.push(task);
}

async function processTask(task, pool) {
  if (task.type === 'updateUser') {
    const { userId, fields } = task;
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k}=$${idx++}`);
      values.push(v);
    }
    values.push(userId);
    const sql = `UPDATE users SET ${sets.join(', ')} WHERE id=$${idx}`;
    try {
      await pool.query(sql, values);
      if (task.onSuccess) task.onSuccess();
    } catch (e) {
      console.error('[Queue] updateUser failed:', e.code || e.message);
      if (task.onError) task.onError(e);
    }
  }
}

async function workLoop(pool) {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const task = queue.shift();
      await processTask(task, pool);
    }
  } finally {
    working = false;
  }
}

function start(poolProvider) {
  if (started) return;
  started = true;
  setInterval(() => {
    const pool = poolProvider();
    if (!pool || pool.disabled) return; // skip if DB not active
    if (queue.length === 0) return;
    workLoop(pool);
  }, 1500).unref();
}

module.exports = { enqueue, start };
