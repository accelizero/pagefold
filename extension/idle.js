import {manageable, pageURL} from './core.js';

export const IDLE_DAYS = 3;
export const IDLE_MS = IDLE_DAYS * 86400000;
export const IDLE_OPTIONS = [
  {value: 30 * 60000, label: '30 分钟'},
  {value: 2 * 3600000, label: '2 小时'},
  {value: 86400000, label: '1 天'},
  {value: 3 * 86400000, label: '3 天'},
  {value: 7 * 86400000, label: '7 天'},
  {value: 14 * 86400000, label: '14 天'}
];

export function idleProtected(tab) {
  return !manageable(tab) || !!tab.pinned || !!tab.active || !!tab.audible;
}

export function idleCandidates(tabs = [], stored = [], now = Date.now(), threshold = IDLE_MS) {
  const storedIds = new Set(stored.map(item => item.id));
  return tabs.filter(tab => !idleProtected(tab) && !storedIds.has(tab.id) &&
    Number.isFinite(tab.lastAccessed) && now - tab.lastAccessed >= threshold)
    .sort((a, b) => a.lastAccessed - b.lastAccessed)
    .map(tab => ({...tab, idleDays: Math.floor((now - tab.lastAccessed) / 86400000)}));
}

export function makeIdleRecord(tab, workspace, now = Date.now()) {
  const context = typeof workspace === 'string' ? {name: workspace} : (workspace || {});
  return {
    id: crypto.randomUUID(),
    url: pageURL(tab),
    title: tab.title || '未命名标签页',
    windowId: tab.windowId,
    index: tab.index,
    workspaceId: context.id || '',
    workspaceName: context.name || '',
    storedAt: now,
    lastAccessed: Number.isFinite(tab.lastAccessed) ? tab.lastAccessed : now
  };
}

export function restoreable(record, tabs = []) {
  return !!record?.url && /^https?:\/\//.test(record.url) &&
    !tabs.some(tab => pageURL(tab) === record.url && !tab.pinned);
}
