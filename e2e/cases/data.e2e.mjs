/**
 * 冒烟用例：数据真的落库了。
 *
 * 这是整套 e2e 里唯一「深」的部分，也是它不可替代的地方。
 *
 * 单测里 zustand store 与存储后端都是内存态的替身，写进去就一定读得出来 —— 那是在
 * 测 store 的逻辑。而这条链路真正会断的地方在中间：backendFor 选错后端、persist 的
 * partialize 漏字段、序列化丢了结构、首启 hydration 与写入抢时序。
 * 这些只有「操作 DOM + 去 IndexedDB 里读字节」才照得出来。
 *
 * 所以这里刻意不看 DOM 上的勾选框，而是绕到库后面去读原始字符串。
 */
import { assert, test } from '../lib/assert.mjs';
import { delay } from '../lib/cdp.mjs';

export const TASK_TITLE = 'E2E 冒烟任务';
/** 迁移用例用的标题，与上面的刻意区分开，免得两条用例互相看到对方的数据 */
export const LEGACY_TASK_TITLE = 'E2E 迁移任务';
/** 餐次模板用例的专用食物名，避免与别的用例撞上 */
export const TEMPLATE_FOOD = 'E2E 模板燕麦';
/** 与 src/store/persist.ts 的 STORE_VERSION 对应；写回时版本对不上 zustand 会走 migrate */
export const STORE_VERSION = 12;

/** 在页面里读 IndexedDB 中某个 key 的原始字符串 */
async function readRaw(session, key) {
  return session.evaluate(
    `(async () => {
      const open = () => new Promise((res, rej) => {
        const rq = indexedDB.open('life-manager');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
      const db = await open();
      const value = await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readonly');
        const rq = tx.objectStore('kv').get(${JSON.stringify(key)});
        rq.onsuccess = () => res(rq.result ?? null);
        rq.onerror = () => rej(rq.error);
      });
      return typeof value === 'string' ? value : null;
    })()`,
  );
}

/** 读并解析出 state */
async function readState(session, key) {
  const raw = await readRaw(session, key);
  if (raw === null) return null;
  const parsed = JSON.parse(raw);
  return parsed?.state ?? null;
}

export function registerDataCases() {
  test('write-task', '加任务 → 勾选完成 → 落库 → 刷新后还在（完整写入链路）', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/tasks`, { waitMs: 1200 });
    session.clearErrors();

    // 起点：确认这个标题此刻不在库里，免得后面的断言其实是撞上了旧数据
    const before = await readState(session, 'lm:tasks');
    const existedBefore = (before?.tasks ?? []).some((t) => t.title === TASK_TITLE);
    assert.equal(existedBefore, false, `跑之前库里不该已经有「${TASK_TITLE}」`);

    // 1) 打开「添加任务」弹窗
    assert.clicked(await session.clickByText('添加任务'), '添加任务按钮');
    await delay(600);
    assert.ok(await session.exists('[role="dialog"]'), '添加任务弹窗');

    // 2) 填标题并提交
    const filled = await session.evaluate(
      `(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const input = dialog.querySelector('input[type="text"], input:not([type])');
        if (!input) return 'MISS';
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(TASK_TITLE)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'OK';
      })()`,
    );
    assert.clicked(filled, '弹窗里的标题输入框');

    assert.clicked(await session.clickByText('添加'), '弹窗里的「添加」按钮');
    await delay(900);
    assert.equal(await session.exists('[role="dialog"]'), false, '提交后弹窗应当关闭');

    // 3) 先确认界面上确实多了这一条
    const bodyText = await session.text('#main-content');
    assert.includes(bodyText, TASK_TITLE, '今日计划页面上应当出现新任务');

    // 4) 再绕到库里看真实字节 —— 这一步才是这条用例的重点
    const afterAdd = await readState(session, 'lm:tasks');
    assert.ok(afterAdd !== null, 'lm:tasks 应当已被写入');
    const added = (afterAdd.tasks ?? []).find((t) => t.title === TASK_TITLE);
    assert.ok(added, `库里应当有「${TASK_TITLE}」`);
    assert.equal(added.status, 'pending', '新任务的初始状态');
    // 结构完整性：字段丢了说明 partialize 漏了东西
    for (const field of ['id', 'priority', 'tags', 'subtasks', 'createdAt']) {
      assert.ok(field in added, `落库的任务应当带 ${field} 字段`);
    }

    // 5) 勾选完成
    const toggleLabel = `完成「${TASK_TITLE}」`;
    assert.clicked(await session.clickByLabel(toggleLabel), toggleLabel);
    await delay(900);

    const afterToggle = await readState(session, 'lm:tasks');
    const toggled = (afterToggle.tasks ?? []).find((t) => t.title === TASK_TITLE);
    assert.equal(toggled.status, 'completed', '勾选后库里该任务的状态');
    assert.nonEmpty(toggled.completedAt ?? '', '完成时间应当被写上');

    // 6) 整页刷新，确认数据活过了重新 hydrate。
    //
    // 这一步刻意留在这条用例里，而不是拆成独立用例：
    // 拆开就得靠「上一条用例留下的数据」，那是一条隐式依赖 ——
    // 单跑能过、全量跑必挂（跑之前清过场）。链路完整比用例粒度整齐重要。
    await session.goto(`${baseUrl}/tasks`, { waitMs: 1600 });

    const afterReloadText = await session.text('#main-content');
    assert.includes(afterReloadText, TASK_TITLE, '刷新后任务应当还在页面上');

    const afterReload = await readState(session, 'lm:tasks');
    const reloaded = (afterReload.tasks ?? []).find((t) => t.title === TASK_TITLE);
    assert.ok(reloaded, '刷新后库里应当还有这条任务');
    // 之前勾成 completed 了，刷新不该把它打回 pending
    assert.equal(reloaded.status, 'completed', '刷新后任务状态不应被回退');

    assert.empty(session.pageErrors, '这条链路里不该有未捕获异常');
  });

  test('legacy-migration', '旧版无前缀 key 的数据会被搬到 lm: 前缀下且旧数据保留', async (ctx) => {
    const { session, baseUrl } = ctx;

    // 用 tasks 而不是 goals：迁移表 LEGACY_STORAGE_KEYS 里只有 v1 就存在的 8 个模块
    // （tasks / books / dev / writing / fitness / diet / games / theme），
    // goals 是 V2.0 才加的模块，旧版压根没有对应的无前缀 key，不在迁移范围内。
    const legacyTask = {
      id: 'lt1',
      title: LEGACY_TASK_TITLE,
      description: '',
      priority: 'high',
      status: 'pending',
      dueDate: '',
      tags: [],
      subtasks: [],
      repeat: null,
      createdAt: new Date().toISOString(),
    };

    // 关键时序：旧 key 必须在**整页刷新之前**种下。
    //
    // migrateLegacyStorageKeys() 是在 storageKeys.ts 模块求值那一刻跑的（见该文件末尾注释），
    // 之后这个会话里它不会再跑。所以「先加载页面、再 setItem、再路由跳转」是测不到的 ——
    // 模块早求值完了，没人会去搬那条旧 key。
    // 只有整页刷新会重新求值一遍模块，迁移才有机会发生。
    await session.goto(`${baseUrl}/`, { waitMs: 1500 });

    // 播种：只写旧的无前缀 key，并把新 key 清掉 ——
    // 迁移必须是「旧有新无」才触发（migrateLegacyStorageKeys 的前置条件）
    const seeded = await session.evaluate(
      `(() => {
        localStorage.removeItem('lm:tasks');
        localStorage.setItem('tasks-storage', ${JSON.stringify(
          JSON.stringify({ state: { tasks: [legacyTask], memos: [] }, version: STORE_VERSION }),
        )});
        return localStorage.getItem('tasks-storage') !== null;
      })()`,
    );
    assert.ok(seeded, '旧版 key 的播种');

    // 整页刷新：模块重新求值 -> 迁移把 tasks-storage 的值写到 lm:tasks ->
    // store hydrate 读到它，并在这一读里顺手搬进 IndexedDB（readAppValue 的逻辑）
    await session.goto(`${baseUrl}/tasks`, { waitMs: 2000 });
    session.clearErrors();

    // 旧 key 必须原样留着 —— 只写不删是这条迁移的约定，
    // 它是搬迁逻辑出问题时的回溯副本（storage.ts 里 readAppValue 的注释）。
    const legacyStillThere = await session.evaluate(
      `localStorage.getItem('tasks-storage') !== null`,
    );
    assert.ok(legacyStillThere, '旧 localStorage key 应当保留不删');

    // 数据搬到了新 key 上
    const migratedRaw = await session.evaluate(`localStorage.getItem('lm:tasks')`);
    assert.ok(migratedRaw !== null, 'lm:tasks 应当被写上');
    const migrated = JSON.parse(migratedRaw);
    const task = (migrated?.state?.tasks ?? []).find((t) => t.id === 'lt1');
    assert.ok(task, 'lm:tasks 里应当有迁移过来的任务');
    assert.equal(task.title, LEGACY_TASK_TITLE, '迁移后的任务标题');
    assert.equal(task.priority, 'high', '迁移后的优先级');

    // 页面上能看见它
    const bodyText = await session.text('#main-content');
    assert.includes(bodyText, LEGACY_TASK_TITLE, '今日计划页应当显示迁移过来的任务');
    assert.empty(session.pageErrors, '迁移过程中不该有未捕获异常');

    // 另一半链路：这次 hydrate 的读取会顺手把它搬进 IndexedDB。
    // 这条断言把「老数据最终落到主后端」钉住 —— 只搬一半的话，
    // 用户下次换环境（IndexedDB 可用、localStorage 被清）数据就没了。
    const inDb = await readState(session, 'lm:tasks');
    assert.ok(inDb !== null, 'hydrate 之后 lm:tasks 应当已落到 IndexedDB');
    assert.ok(
      (inDb.tasks ?? []).some((t) => t.id === 'lt1'),
      'IndexedDB 里应当有迁移过来的任务',
    );

    // 收尾：把旧 key 清掉，免得影响后面的用例
    await session.evaluate(`localStorage.removeItem('tasks-storage'); 1`);
  });

  test('v12-migration', 'v11 的旧档升到 v12：补出空的动作清单与餐次模板，旧数据不丢', async (ctx) => {
    const { session, baseUrl } = ctx;

    /*
     * 这条盯的是升级路径，不是「能不能读」。
     *
     * 真实场景是：用户机器上躺着一份 v11 的 lm:fitness 与 lm:diet，装上 v12 之后
     * 首次打开。migrateState 只补根级字段，所以 templates / exercises 这两个新字段
     * 会由 normalize 层在读到记录时补齐。整条链路上任何一环漏了，用户看到的就是
     * 「模板区不见了」或者「训练计划点开是空的」—— 而旧数据本身必须一个不少。
     *
     * 刻意写 v11 而不是当前版本：版本号对得上就不会走 migrate，等于什么都没测。
     */
    await session.goto(`${baseUrl}/`, { waitMs: 1500 });

    const fitnessV11 = {
      state: {
        plans: [
          {
            id: 'p-legacy',
            name: 'E2E 旧版推日',
            description: 'v11 建的，当时还没有动作清单',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        records: [],
      },
      version: 11,
    };
    const dietV11 = {
      state: {
        records: [
          {
            id: 'd-legacy',
            date: '2026-01-01',
            type: 'breakfast',
            items: [{ id: 'it1', name: 'E2E 旧版燕麦', category: '主食', calories: 300 }],
            totalCalories: 300,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        goals: { calories: 2000, protein: 80 },
        water: {},
      },
      version: 11,
    };

    const seeded = await session.evaluate(
      `(() => {
        localStorage.removeItem('lm:fitness');
        localStorage.removeItem('lm:diet');
        localStorage.setItem('fitness-storage', ${JSON.stringify(JSON.stringify(fitnessV11))});
        localStorage.setItem('diet-storage', ${JSON.stringify(JSON.stringify(dietV11))});
        return true;
      })()`,
    );
    assert.ok(seeded, 'v11 旧档的播种');

    // 整页刷新让模块重新求值，迁移与 hydrate 才有机会跑
    await session.goto(`${baseUrl}/fitness`, { waitMs: 2000 });
    session.clearErrors();

    const fitness = await readState(session, 'lm:fitness');
    assert.ok(fitness, 'lm:fitness 应当已落到 IndexedDB');
    const plan = (fitness.plans ?? []).find((p) => p.id === 'p-legacy');
    assert.ok(plan, 'v11 的训练计划必须原样保留');
    assert.equal(plan.name, 'E2E 旧版推日', '计划名不该被改写');
    assert.equal(plan.description, 'v11 建的，当时还没有动作清单', '说明不该被改写');
    // v12 新增字段：补成空数组而不是 undefined，否则渲染层 plan.exercises.length 会炸
    assert.ok(Array.isArray(plan.exercises), '新补的动作清单应当是数组');
    assert.equal(plan.exercises.length, 0, '旧计划没有动作，补出来就该是空的');

    await session.goto(`${baseUrl}/diet`, { waitMs: 2000 });
    const diet = await readState(session, 'lm:diet');
    assert.ok(diet, 'lm:diet 应当已落到 IndexedDB');
    assert.ok(Array.isArray(diet.templates), '新补的餐次模板应当是数组');
    assert.equal(diet.templates.length, 0, '旧档没有模板，补出来就该是空的');
    const record = (diet.records ?? []).find((r) => r.id === 'd-legacy');
    assert.ok(record, 'v11 的饮食记录必须原样保留');
    assert.equal(record.totalCalories, 300, '旧记录的热量不该丢');

    // 界面上也要能看见旧数据，别只活在库里
    const bodyText = await session.text('#main-content');
    assert.includes(bodyText, '早餐', '饮食页应当渲染出旧记录所在的餐次');
    assert.empty(session.pageErrors, '升级路径上不该有未捕获异常');

    await session.evaluate(
      `localStorage.removeItem('fitness-storage'); localStorage.removeItem('diet-storage'); 1`,
    );
  });

  test('meal-template-prefill', '一餐存成模板后，点一下就能按今天预填进表单', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/diet`, { waitMs: 1500 });
    session.clearErrors();

    // 先记一餐，才有东西可存成模板
    const opened = await session.clickByText('记录饮食');
    assert.clicked(opened, '「记录饮食」按钮');
    await delay(600);
    await session.fill('input[aria-label="第 1 个食物名称"]', TEMPLATE_FOOD);
    await session.fill('input[aria-label="第 1 个食物的热量"]', '233');
    await session.clickByText('保存');
    await delay(800);

    const afterSave = await readState(session, 'lm:diet');
    assert.equal(
      (afterSave?.records ?? []).length,
      1,
      `保存后应当有 1 条记录（实际 ${JSON.stringify(afterSave?.records ?? [])}）`,
    );

    // 记录行上的「存成模板」
    const saved = await session.evaluate(
      `(() => {
        const b = [...document.querySelectorAll('button')].find(n =>
          (n.getAttribute('aria-label') ?? '').startsWith('把「'));
        if (!b) return 'MISS';
        b.click();
        return b.getAttribute('aria-label');
      })()`,
    );
    assert.ok(saved !== 'MISS', '记录行上应当有「存成模板」按钮');
    await delay(500);

    const templates = await readState(session, 'lm:diet');
    assert.equal((templates?.templates ?? []).length, 1, '模板应当落库');

    // 模板区出现，点它预填
    const bodyText = await session.text('#main-content');
    assert.includes(bodyText, '常吃组合', '有模板之后应当出现模板区');

    const filled = await session.evaluate(
      `(() => {
        const b = [...document.querySelectorAll('button')].find(n =>
          (n.getAttribute('aria-label') ?? '').startsWith('用模板「'));
        if (!b) return 'MISS';
        b.click();
        return b.getAttribute('aria-label');
      })()`,
    );
    assert.ok(filled !== 'MISS', '模板胶囊应当可点');
    await delay(800);

    // 表单里应当已经铺好了模板的食物，日期是今天
    const name = await session.evaluate(
      `(() => { const el = document.querySelector('input[aria-label="第 1 个食物名称"]'); return el ? el.value : null; })()`,
    );
    assert.equal(name, TEMPLATE_FOOD, '模板的食物名应当被预填');

    const today = new Date().toLocaleDateString('sv-SE');
    // 日期字段走的是可见 <label for>，不是 aria-label，得按 label 文本反查 id
    const date = await session.evaluate(
      `(() => {
        const label = [...document.querySelectorAll('label')].find(n => n.textContent.trim().replace(/\\*$/, '') === '日期');
        if (!label) return 'NO_LABEL';
        const el = document.getElementById(label.getAttribute('for'));
        return el ? el.value : null;
      })()`,
    );
    assert.equal(date, today, '预填的日期应当是今天');

    assert.empty(session.pageErrors, '这条链路里不该有未捕获异常');
  });

  test('theme-persists', '主题存在 lm:theme 上，且刷新后保持', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/`, { waitMs: 1200 });

    // 主题刻意留在 localStorage（首屏防闪烁脚本读不到 IndexedDB），
    // 这条断言是把这个设计决定钉住：哪天有人为了「统一」把它搬走，这里会红。
    const res = await session.evaluate(
      `(() => {
        const b = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label') ?? '').startsWith('主题：'));
        if (!b) return 'MISS';
        b.click();
        return 'OK';
      })()`,
    );
    assert.clicked(res, '主题开关');
    await delay(800);

    const stored = await session.evaluate(`localStorage.getItem('lm:theme')`);
    assert.ok(stored !== null, 'lm:theme 应当写在 localStorage 上');

    const mode = await session.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label') ?? '').startsWith('主题：')); return b ? b.getAttribute('aria-label') : null; })()`,
    );

    await session.goto(`${baseUrl}/`, { waitMs: 1200 });
    const modeAfter = await session.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label') ?? '').startsWith('主题：')); return b ? b.getAttribute('aria-label') : null; })()`,
    );
    assert.equal(modeAfter, mode, '刷新后主题模式应当保持');
  });
}
