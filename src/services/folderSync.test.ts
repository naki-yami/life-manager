import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupData } from './schemas';
import { serializeBackup } from './backup';
import {
  FOLDER_BACKUP_FILE,
  chooseFolderBackupFolder,
  forgetFolderBackupFolder,
  getFolderBackupStatus,
  isFolderBackupSupported,
  isFolderPickerAbort,
  resetFolderBackupStore,
  syncFolderBackupOnBoot,
  writeFolderBackupNow,
} from './folderSync';
import { installIndexedDbStub } from '../test/indexedDbStub';
import { fakeFolder, stubDirectoryPicker } from '../test/fakeFolder';

afterEach(() => {
  // 句柄仓库缓存与假 indexedDB 都是全局的，不清会串到下一个用例
  resetFolderBackupStore();
  vi.unstubAllGlobals();
});

const NOW = new Date(2026, 8, 29, 9, 0, 0);

/** 这一层验的是「授权 + 写文件」的编排，模块内容本身是空的就够 */
function emptyBackupData(): BackupData {
  return {
    tasks: [],
    memos: [],
    books: [],
    devProjects: [],
    workSessions: [],
    writingProjects: [],
    fitnessPlans: [],
    fitnessRecords: [],
    bodyMetrics: [],
    dietRecords: [],
    games: [],
    gameSessions: [],
    readingSessions: [],
    habits: [],
    focusSessions: [],
    reviews: [],
    goals: [],
  customFoods: [],
  customExercises: [],
  };
}

describe('支持判定', () => {
  it('jsdom 里既没有 indexedDB 也没有目录选择器，判定为不支持', () => {
    expect(isFolderBackupSupported()).toBe(false);
  });

  it('注入了 IndexedDB 与目录选择器之后才算支持', () => {
    installIndexedDbStub();
    stubDirectoryPicker(fakeFolder().handle);
    expect(isFolderBackupSupported()).toBe(true);
  });

  it('只有目录选择器、没有 IndexedDB 时仍然算不支持——句柄跨会话记不住', () => {
    stubDirectoryPicker(fakeFolder().handle);
    expect(isFolderBackupSupported()).toBe(false);
  });
});

describe('选择文件夹', () => {
  it('写一份完整备份进去，并记住这个文件夹', async () => {
    installIndexedDbStub();
    const folder = fakeFolder('生活备份');
    stubDirectoryPicker(folder.handle);

    const data = emptyBackupData();
    const status = await chooseFolderBackupFolder(data, NOW);

    expect(status).toEqual({
      folderName: '生活备份',
      lastWrittenAt: NOW.toISOString(),
      granted: true,
    });
    // 写出去的就是「导出 JSON」同一套信封格式，可以直接再导入回来
    expect(folder.files.get(FOLDER_BACKUP_FILE)).toBe(serializeBackup(data, NOW));
    // 记住的句柄要能跨读取：换一个会话（重新读库）也还在
    resetFolderBackupStore();
    expect(await getFolderBackupStatus()).toEqual(status);
  });

  it('从来没有选过文件夹时，状态是空的', async () => {
    installIndexedDbStub();
    expect(await getFolderBackupStatus()).toBeNull();
  });

  it('浏览器不支持时抛出可读的错误，而不是静默什么都不做', async () => {
    installIndexedDbStub();
    await expect(chooseFolderBackupFolder(emptyBackupData(), NOW)).rejects.toThrow(/不支持/);
  });

  it('用户在系统弹窗里点了取消，抛的是 AbortError 且能被识别出来', async () => {
    installIndexedDbStub();
    const abort = new Error('用户取消');
    abort.name = 'AbortError';
    vi.stubGlobal(
      'showDirectoryPicker',
      vi.fn(async () => {
        throw abort;
      }),
    );

    const failure: unknown = await chooseFolderBackupFolder(emptyBackupData(), NOW).catch(
      (error: unknown) => error,
    );
    expect(isFolderPickerAbort(failure)).toBe(true);
  });
});

describe('开机静默写入', () => {
  it('没选过文件夹时什么都不做，连目录选择框都不弹', async () => {
    installIndexedDbStub();
    const picker = stubDirectoryPicker(fakeFolder().handle);

    expect(await syncFolderBackupOnBoot(emptyBackupData(), NOW)).toBeNull();
    expect(picker).not.toHaveBeenCalled();
  });

  it('已经授权时覆盖写一份最新备份', async () => {
    installIndexedDbStub();
    const folder = fakeFolder();
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(emptyBackupData(), NOW);

    const later = new Date(2026, 8, 30, 8, 0, 0);
    const data = emptyBackupData();
    const status = await syncFolderBackupOnBoot(data, later);

    expect(status?.lastWrittenAt).toBe(later.toISOString());
    expect(folder.files.get(FOLDER_BACKUP_FILE)).toBe(serializeBackup(data, later));
  });

  it('授权失效时直接跳过，绝不弹窗', async () => {
    installIndexedDbStub();
    const folder = fakeFolder();
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(emptyBackupData(), NOW);

    // 浏览器在长时间不用之后会把授权收回成 prompt
    folder.state.permission = 'prompt';
    const picker = stubDirectoryPicker(folder.handle);

    expect(await syncFolderBackupOnBoot(emptyBackupData(), NOW)).toBeNull();
    expect(picker).not.toHaveBeenCalled();
    expect((await getFolderBackupStatus())?.granted).toBe(false);
  });

  it('目标文件夹写不进去也只是跳过，不把异常抛给启动流程', async () => {
    installIndexedDbStub();
    const folder = fakeFolder();
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(emptyBackupData(), NOW);

    folder.state.failWrite = true;
    expect(await syncFolderBackupOnBoot(emptyBackupData(), NOW)).toBeNull();
  });
});

describe('手动写入与取消授权', () => {
  it('还没选过文件夹时手动写入会明确报错', async () => {
    installIndexedDbStub();
    await expect(writeFolderBackupNow(emptyBackupData(), NOW)).rejects.toThrow(/还没有选择/);
  });

  it('立即写入用最新数据覆盖同一份文件，不会堆出一串历史文件', async () => {
    installIndexedDbStub();
    const folder = fakeFolder();
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(emptyBackupData(), NOW);

    const later = new Date(2026, 8, 30, 8, 0, 0);
    const data = emptyBackupData();
    const status = await writeFolderBackupNow(data, later);

    expect(status.lastWrittenAt).toBe(later.toISOString());
    expect([...folder.files.keys()]).toEqual([FOLDER_BACKUP_FILE]);
    expect(folder.files.get(FOLDER_BACKUP_FILE)).toBe(serializeBackup(data, later));
  });

  it('授权过期时手动写入会重新请求一次授权，拿到之后照常写入', async () => {
    installIndexedDbStub();
    const folder = fakeFolder();
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(emptyBackupData(), NOW);

    // 浏览器把授权收回成 prompt：状态显示「需要重新授权」，但手动写入能再问一次
    folder.state.permission = 'prompt';
    expect((await getFolderBackupStatus())?.granted).toBe(false);

    const later = new Date(2026, 8, 30, 8, 0, 0);
    const status = await writeFolderBackupNow(emptyBackupData(), later);

    expect(status.granted).toBe(true);
    expect(folder.state.permission).toBe('granted');
    expect((await getFolderBackupStatus())?.lastWrittenAt).toBe(later.toISOString());
  });

  it('用户拒绝授权时手动写入报错，不会硬写', async () => {
    installIndexedDbStub();
    const folder = fakeFolder();
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(emptyBackupData(), NOW);

    folder.state.permission = 'prompt';
    folder.state.grantedOnRequest = 'denied';
    await expect(writeFolderBackupNow(emptyBackupData(), NOW)).rejects.toThrow(/写入权限/);
  });

  it('目标文件夹不可写时手动写入抛出可读的错误', async () => {
    installIndexedDbStub();
    const folder = fakeFolder();
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(emptyBackupData(), NOW);

    folder.state.failWrite = true;
    await expect(writeFolderBackupNow(emptyBackupData(), NOW)).rejects.toThrow(/磁盘已满/);
  });

  it('取消授权之后状态回到空，但已经写出去的文件不动', async () => {
    installIndexedDbStub();
    const folder = fakeFolder();
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(emptyBackupData(), NOW);

    await forgetFolderBackupFolder();

    expect(await getFolderBackupStatus()).toBeNull();
    expect(folder.files.has(FOLDER_BACKUP_FILE)).toBe(true);
  });
});
