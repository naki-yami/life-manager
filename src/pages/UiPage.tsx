import React, { useState } from 'react';
import { BookOpen, Download, Inbox, Plus, Search, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  CheckboxRow,
  ConfirmDialog,
  Divider,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  Input,
  Kbd,
  Modal,
  NumberInput,
  ProgressBar,
  ProgressRing,
  RadioGroup,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Spinner,
  StatCard,
  Switch,
  Textarea,
  Tooltip,
  useToast,
  type BadgeTone,
} from '../components/ui';
import { useTheme } from '../hooks/useTheme';

const Section: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className="space-y-4">
    <div>
      <h2 className="text-base font-semibold text-content">{title}</h2>
      {description && <p className="mt-1 text-xs text-content-tertiary">{description}</p>}
    </div>
    <Card>
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  </section>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:items-center">
    <span className="text-xs text-content-tertiary">{label}</span>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

const SWATCHES: { name: string; className: string; token: string }[] = [
  { name: 'canvas', className: 'bg-canvas', token: '--lm-bg-canvas' },
  { name: 'surface', className: 'bg-surface', token: '--lm-bg-surface' },
  { name: 'elevated', className: 'bg-elevated', token: '--lm-bg-elevated' },
  { name: 'inset', className: 'bg-inset', token: '--lm-bg-inset' },
  { name: 'accent', className: 'bg-accent', token: '--lm-accent' },
  { name: 'accent-soft', className: 'bg-accent-soft', token: '--lm-accent-soft' },
  { name: 'success', className: 'bg-success', token: '--lm-success' },
  { name: 'warning', className: 'bg-warning', token: '--lm-warning' },
  { name: 'danger', className: 'bg-danger', token: '--lm-danger' },
  { name: 'info', className: 'bg-info', token: '--lm-info' },
];

const BADGE_TONES: BadgeTone[] = ['default', 'accent', 'success', 'warning', 'danger', 'info'];

export const UiPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState<number | ''>(3);
  const [fruit, setFruit] = useState('apple');
  const [enabled, setEnabled] = useState(true);
  const [checked, setChecked] = useState(true);
  const [progress, setProgress] = useState(42);
  const [view, setView] = useState<'list' | 'board' | 'group'>('list');
  const [radio, setRadio] = useState('medium');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">组件预览</h1>
          <p className="mt-1 text-xs text-content-tertiary">
            设计系统 Kitchen Sink · 每个组件都列出完整状态，用来核对视觉与交互
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={toggleTheme}>
          切到{theme === 'light' ? '暗色' : '亮色'}
        </Button>
      </div>

      <Section title="色彩令牌" description="全部来自 CSS 变量，切换亮/暗主题时自动跟随">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SWATCHES.map((swatch) => (
            <div key={swatch.name} className="space-y-1.5">
              <div
                className={`h-12 rounded border border-line-subtle ${swatch.className}`}
                aria-hidden
              />
              <p className="text-2xs text-content-secondary">{swatch.name}</p>
              <p className="text-2xs text-content-tertiary">{swatch.token}</p>
            </div>
          ))}
        </div>
        <Divider />
        <div className="space-y-1">
          <p className="text-sm text-content">content — 正文与标题</p>
          <p className="text-sm text-content-secondary">content-secondary — 次要说明</p>
          <p className="text-xs text-content-tertiary">content-tertiary — 辅助信息</p>
          <p className="text-xs text-content-disabled">content-disabled — 禁用状态</p>
        </div>
      </Section>

      <Section title="Button" description="5 种变体 × 3 种尺寸，含 loading / disabled / 图标">
        <Row label="变体">
          <Button>primary</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="outline">outline</Button>
          <Button variant="ghost">ghost</Button>
          <Button variant="danger">danger</Button>
        </Row>
        <Row label="尺寸">
          <Button size="sm">small</Button>
          <Button size="md">medium</Button>
          <Button size="lg">large</Button>
        </Row>
        <Row label="状态">
          <Button loading>提交中</Button>
          <Button disabled>已禁用</Button>
          <Button icon={<Plus size={16} />}>新建</Button>
          <Button variant="secondary" icon={<Download size={16} />} iconRight={<span>↗</span>}>
            导出
          </Button>
        </Row>
        <Row label="图标按钮">
          <IconButton label="搜索" icon={<Search size={16} />} />
          <IconButton label="删除" variant="secondary" icon={<Trash2 size={16} />} />
          <IconButton label="添加" variant="outline" icon={<Plus size={16} />} size="sm" />
          <IconButton label="危险操作" variant="danger" icon={<Trash2 size={16} />} />
        </Row>
        <Row label="通栏">
          <div className="w-full sm:w-64">
            <Button fullWidth icon={<Plus size={16} />}>
              新建项目
            </Button>
          </div>
        </Row>
      </Section>

      <Section title="表单控件" description="label / hint / error 三态齐备，错误态带 role=alert">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="普通输入"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入点什么"
          />
          <Input
            label="带帮助文本"
            hint="最多 50 个字"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Input
            label="错误状态"
            error="这个名称已经被占用了"
            value="重复的名字"
            onChange={() => {}}
          />
          <Input label="禁用状态" value="不可编辑" disabled onChange={() => {}} />
          <Input label="必填" value="" onChange={() => {}} required />
          <Input label="日期" type="date" value="2026-09-28" onChange={() => {}} />
        </div>
        <Textarea
          label="多行文本"
          hint="支持纵向拉伸"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="写点什么…"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput label="数量" value={count} onChange={setCount} min={0} max={99} />
          <NumberInput label="重量" value={count} onChange={setCount} suffix="kg" step={2.5} />
        </div>
        <Select
          label="下拉选择"
          value={fruit}
          onChange={setFruit}
          options={[
            { value: 'apple', label: '苹果' },
            { value: 'banana', label: '香蕉' },
            { value: 'cherry', label: '樱桃' },
            { value: 'durian', label: '榴莲（缺货）', disabled: true },
          ]}
        />
      </Section>

      <Section title="选择控件">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-3">
            <Checkbox
              checked={checked}
              onChange={setChecked}
              label="订阅更新"
              description="有新的版本时通知我"
            />
            <Checkbox checked={false} onChange={() => {}} label="未选中的复选框" />
            <Checkbox checked={false} onChange={() => {}} label="禁用" disabled />
            <CheckboxRow checked={checked} onChange={setChecked} label="列表项勾选（整行可点）" />
          </div>
          <div className="space-y-4">
            <Switch
              checked={enabled}
              onChange={setEnabled}
              label="自动保存"
              description="编辑时每 30 秒保存一次草稿"
            />
            <Switch checked={false} onChange={() => {}} label="关闭状态的开关" />
            <RadioGroup
              label="优先级"
              value={radio}
              onChange={setRadio}
              options={[
                { value: 'high', label: '高', description: '今天必须完成' },
                { value: 'medium', label: '中' },
                { value: 'low', label: '低' },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Slider 与进度">
        <Slider
          label="阅读进度"
          value={progress}
          onChange={setProgress}
          showValue
          formatValue={(v) => `${v}%`}
        />
        <Slider
          label="带自定义格式"
          value={progress}
          onChange={setProgress}
          min={0}
          max={500}
          step={10}
          showValue
          formatValue={(v) => `${v} 页`}
        />
        <Divider />
        <div className="space-y-4">
          <ProgressBar value={progress} showValue label="默认" />
          <ProgressBar value={progress} tone="success" label="达标" />
          <ProgressBar value={88} tone="warning" label="接近上限" />
          <ProgressBar value={120} max={100} tone="danger" label="超出目标" />
        </div>
        <div className="flex flex-wrap items-center gap-6 pt-2">
          <ProgressRing value={progress} label="默认圆环" />
          <ProgressRing
            value={progress}
            tone="success"
            size={88}
            strokeWidth={8}
            label="成功色圆环"
          />
          <ProgressRing value={progress} tone="warning" label="自定义内容圆环">
            <span className="text-xs">42/100</span>
          </ProgressRing>
        </div>
      </Section>

      <Section title="SegmentedControl / Badge / Kbd">
        <Row label="视图切换">
          <SegmentedControl
            label="切换视图"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: '列表' },
              { value: 'board', label: '看板' },
              { value: 'group', label: '分组', count: 3 },
            ]}
          />
          <SegmentedControl
            label="紧凑尺寸"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: '列表' },
              { value: 'board', label: '看板' },
            ]}
          />
        </Row>
        <Row label="标签">
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} tone={tone} dot={tone !== 'default'}>
              {tone}
            </Badge>
          ))}
          <Badge tone="accent" size="md">
            中等尺寸
          </Badge>
        </Row>
        <Row label="键盘键">
          <span className="text-xs text-content-secondary">
            按 <Kbd>⌘</Kbd> <Kbd>K</Kbd> 打开命令面板，<Kbd>Esc</Kbd> 关闭
          </span>
        </Row>
        <Divider label="带文字的分隔" />
      </Section>

      <Section title="Feedback" description="警告、空状态、错误态、骨架屏">
        <div className="space-y-2">
          <Alert tone="info" title="这是一条信息">
            导入前会先做校验，确认后才会写入数据。
          </Alert>
          <Alert tone="success" title="保存成功" onDismiss={() => {}}>
            共写入 12 条记录。
          </Alert>
          <Alert tone="warning" title="有 2 条数据未通过校验">
            tasks[1]: priority 不是合法值
          </Alert>
          <Alert tone="danger" title="导入失败">
            文件不是合法的 JSON。
          </Alert>
        </div>
        <Divider />
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <EmptyState
              icon={<Inbox size={20} />}
              title="还没有任何书籍"
              description="添加第一本想读的书，开始记录你的阅读进度。"
              action={
                <Button size="sm" icon={<Plus size={16} />}>
                  添加书籍
                </Button>
              }
            />
          </Card>
          <Card>
            <ErrorState onRetry={() => toast({ title: '已重试', tone: 'info' })} />
          </Card>
        </div>
        <Divider />
        <div className="flex flex-wrap items-center gap-4">
          <Spinner />
          <Spinner size={24} />
          <span className="text-xs text-content-tertiary">Spinner</span>
        </div>
        <div className="space-y-2">
          <Skeleton height={14} width="60%" />
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="40%" />
        </div>
      </Section>

      <Section title="Card 与 StatCard">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="待办任务"
            value={7}
            tone="accent"
            trend={{ value: 12, label: '较上周' }}
          />
          <StatCard
            label="本周训练"
            value={4}
            unit="次"
            tone="success"
            icon={<BookOpen size={14} />}
          />
          <StatCard
            label="连续打卡"
            value={23}
            unit="天"
            trend={{ value: -8, label: '较上周' }}
            footer="最长记录 41 天"
          />
        </div>
        <Card>
          <CardHeader
            title="卡片标题"
            subtitle="副标题说明用途"
            action={
              <Button variant="ghost" size="sm">
                查看全部
              </Button>
            }
          />
          <CardBody className="space-y-2">
            <p className="text-sm text-content-secondary">
              CardHeader / CardBody / CardFooter 三段式结构，分隔线使用 border-line-subtle。
            </p>
            <Tooltip content="这是悬浮提示，也会在有焦点时显示">
              <Button variant="outline" size="sm">
                悬浮看看
              </Button>
            </Tooltip>
          </CardBody>
          <CardFooter>
            <Button variant="secondary" size="sm">
              取消
            </Button>
            <Button size="sm">保存</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Toast / Modal / ConfirmDialog">
        <Row label="Toast">
          <Button size="sm" onClick={() => toast({ title: '已保存', tone: 'success' })}>
            成功
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              toast({
                title: '已删除 1 个任务',
                tone: 'info',
                action: {
                  label: '撤销',
                  onClick: () => toast({ title: '已恢复', tone: 'success' }),
                },
              })
            }
          >
            带撤销
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() =>
              toast({
                title: '导出失败',
                description: '浏览器拒绝了下载请求。',
                tone: 'danger',
                duration: 0,
              })
            }
          >
            错误（不自动关闭）
          </Button>
        </Row>
        <Row label="弹层">
          <Button size="sm" variant="secondary" onClick={() => setModalOpen(true)}>
            打开 Modal
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(true)}>
            二次确认
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDangerOpen(true)}>
            危险操作（需输入确认词）
          </Button>
        </Row>
      </Section>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Modal 标题"
        description="Esc 关闭、Tab 在弹层内循环、背景滚动锁定"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                setModalOpen(false);
                toast({ title: '已提交', tone: 'success' });
              }}
            >
              提交
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="表单字段" value={text} onChange={(e) => setText(e.target.value)} />
          <Alert tone="info">弹层内容超出高度时，只有正文区域滚动，标题与底部按钮固定。</Alert>
          <div className="h-40 rounded bg-inset" aria-hidden />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          toast({ title: '已确认', tone: 'success' });
        }}
        title="确认删除这本书？"
        description="删除后可以到「数据与设置」里通过自动备份回滚。"
        confirmText="删除"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={dangerOpen}
        onClose={() => setDangerOpen(false)}
        onConfirm={() => {
          setDangerOpen(false);
          toast({ title: '已清空演示数据', tone: 'info' });
        }}
        title="清空全部数据"
        description="不可逆操作，请输入确认词。"
        requireText="清空"
        confirmText="确认清空"
        tone="danger"
      />

      <Section title="FormField" description="给 Slider / Switch 这类非原生控件用的字段外壳">
        <FormField label="字段标题" hint="帮助文本" htmlFor="demo-field">
          <div
            id="demo-field"
            className="rounded border border-line bg-inset px-3 py-2 text-sm text-content-secondary"
          >
            自定义控件占位
          </div>
        </FormField>
        <FormField label="带错误的字段" error="这里必须填一个值">
          <div className="rounded border border-danger bg-inset px-3 py-2 text-sm text-content-secondary">
            自定义控件占位
          </div>
        </FormField>
      </Section>
    </div>
  );
};
