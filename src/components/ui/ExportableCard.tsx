import React, { useRef, useState } from 'react';
import { ImageDown, Loader2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from './Card';
import { IconButton } from './Button';
import { useOptionalToast } from './toastContext';
import { exportElementAsPng } from '../../utils/chartExport';

export interface ExportableCardProps {
  title: string;
  subtitle?: string;
  /** 导出文件名里用的名字，默认与 title 相同 */
  exportLabel?: string;
  /** 正文外层 CardBody 的类名 */
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * 带「导出 PNG」按钮的图表卡。
 *
 * 按钮挂在卡片的操作区，导出的是**整张卡片** —— 标题、单位、图例一起带走，
 * 所以这里自己持有卡片的 ref，而不是让调用方每张卡都建一个 ref 再往下传。
 * 按钮带 `data-export-skip`，不会把自己拍进图里。
 *
 * 导出失败只提示不抛：截图依赖浏览器的 SVG / canvas 能力，个别环境会不给，
 * 这时候页面不该跟着崩。
 */
export const ExportableCard: React.FC<ExportableCardProps> = ({
  title,
  subtitle,
  exportLabel,
  bodyClassName,
  className,
  children,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const toast = useOptionalToast();
  const label = exportLabel ?? title;

  const handleExport = async (): Promise<void> => {
    const element = cardRef.current;
    if (!element || exporting) return;
    setExporting(true);
    try {
      const fileName = await exportElementAsPng(element, label);
      toast?.toast({ title: '已导出图片', description: fileName, tone: 'success' });
    } catch {
      toast?.toast({
        title: '图表导出失败',
        description: '这个浏览器没能完成截图，换一个再试试',
        tone: 'danger',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card ref={cardRef} className={className}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <IconButton
            label={`导出「${title}」为 PNG`}
            icon={
              exporting ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : (
                <ImageDown size={15} aria-hidden />
              )
            }
            size="sm"
            data-export-skip
            disabled={exporting}
            onClick={handleExport}
          />
        }
      />
      <CardBody className={bodyClassName}>{children}</CardBody>
    </Card>
  );
};
