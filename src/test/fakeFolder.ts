import { vi } from 'vitest';

/*
 * 假文件夹 + 假目录选择器。
 *
 * File System Access API 在 jsdom 里完全不存在，但「拿到授权 → 覆盖写一份文件」
 * 正是这条功能唯一值得测的部分，所以用一个只实现所需方法的假句柄顶上。
 */

export interface FakeFolder {
  handle: FileSystemDirectoryHandle;
  /** 文件夹里现有的文件：文件名 -> 内容 */
  files: Map<string, string>;
  state: {
    /** queryPermission 的返回值 */
    permission: PermissionState;
    /** requestPermission 会把授权改成什么 */
    grantedOnRequest: PermissionState;
    /** 打开为 true 时写文件会抛错，用来模拟磁盘满 / 目录被删 */
    failWrite: boolean;
  };
}

export function fakeFolder(name = '我的备份', permission: PermissionState = 'granted'): FakeFolder {
  const files = new Map<string, string>();
  const state: FakeFolder['state'] = { permission, grantedOnRequest: 'granted', failWrite: false };

  const handle = {
    kind: 'directory',
    name,
    queryPermission: async () => state.permission,
    requestPermission: async () => {
      // 真实现里这一步会弹系统授权框；这里直接给出预设结果
      state.permission = state.grantedOnRequest;
      return state.permission;
    },
    getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
      if (state.failWrite) throw new Error('磁盘已满');
      if (!files.has(fileName) && options?.create !== true) throw new Error('文件不存在');
      return {
        kind: 'file',
        name: fileName,
        createWritable: async () => {
          let buffer = '';
          return {
            write: async (chunk: string) => {
              buffer += chunk;
            },
            close: async () => {
              files.set(fileName, buffer);
            },
          };
        },
      };
    },
  };

  return { handle: handle as unknown as FileSystemDirectoryHandle, files, state };
}

/** 装一个假的 showDirectoryPicker（返回同一个句柄），返回值可以断言有没有被调用 */
export function stubDirectoryPicker(handle: FileSystemDirectoryHandle) {
  const picker = vi.fn(async () => handle);
  vi.stubGlobal('showDirectoryPicker', picker);
  return picker;
}
