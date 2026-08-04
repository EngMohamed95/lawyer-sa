/**
 * تقرير أعمار الديون — الوثيقة §1.9 (R4).
 *
 * يوزّع المستحق غير المسدَّد على فئات التقادم لكل عميل، فيُظهر
 * أين يتراكم التأخير بدل رقم إجمالي واحد لا يُفيد في التحصيل.
 * يُدرَج داخل صفحة التقارير القائمة دون المساس بأقسامها.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Clock, RefreshCw, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { usePermissions } from "../lib/usePermissions";
import { excludeDeleted } from "../lib/softDelete";
import {
  AGING_LABELS_AR, buildAging, daysOverdue, displayStatus,
  type AgingBucket, type Invoice,
} from "../lib/billing";

const BUCKETS: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

const BUCKET_COLORS: Record<AgingBucket, string> = {
  "0-30": "text-green-700 bg-green-50",
  "31-60": "text-amber-700 bg-amber-50",
  "61-90": "text-orange-700 bg-orange-50",
  "90+": "text-red-700 bg-red-50",
};

const money = (n: unknown) =>
  (Number(n) || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AgingReport({ currencySymbol }: { currencySymbol: string }) {
  const perms = usePermissions();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (!perms.lawyerId) { setRows([]); return; }
      const snap = await getDocs(
        query(collection(db, "invoices"), where("lawyerId", "==", perms.lawyerId)),
      );
      setRows(excludeDeleted(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Invoice, "id">) }))));
    } catch (err) {
      console.error("Error fetching invoices for aging:", err);
      setError("تعذّر تحميل بيانات المتأخرات.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId]);

  const aging = useMemo(() => buildAging(rows), [rows]);

  /** الفواتير المتأخرة فعلاً — مرتبة بالأقدم تأخيراً */
  const overdueInvoices = useMemo(
    () => rows
      .filter((r) => displayStatus(r) === "OVERDUE" && (Number(r.remainingAmount) || 0) > 0)
      .sort((a, b) => daysOverdue(b.dueDate) - daysOverdue(a.dueDate)),
    [rows],
  );

  const exportCsv = () => {
    const header = ["العميل", ...BUCKETS.map((b) => AGING_LABELS_AR[b]), "الإجمالي"];
    const lines = aging.rows.map((r) => [
      r.clientName, ...BUCKETS.map((b) => r.buckets[b].toFixed(2)), r.total.toFixed(2),
    ]);
    const totals = ["الإجمالي", ...BUCKETS.map((b) => aging.totals[b].toFixed(2)), aging.grandTotal.toFixed(2)];
    // BOM حتى يفتح Excel العربية بترميز صحيح
    const csv = "﻿" + [header, ...lines, totals].map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `اعمار-الديون-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="shadow-sm border-gray-200" dir="rtl">
      <CardHeader className="border-b bg-gray-50/50 flex flex-row items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-[#D4AF37]" />
          <div>
            <CardTitle className="text-lg text-[#133B2E]">أعمار الديون (المتأخرات)</CardTitle>
            <CardDescription className="text-xs">
              المستحق غير المسدَّد موزّعاً على فئات التقادم — لا يشمل المسودات ولا الملغاة
            </CardDescription>
          </div>
        </div>
        <div className="flex gap-2">
          {aging.rows.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv}
              className="rounded-xl border-green-200 text-green-700 hover:bg-green-50">
              <FileSpreadsheet size={14} className="ml-1" /> تصدير
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-xl border-gray-200">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error && (
          <div className="flex items-start gap-2 m-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-10 text-center text-gray-500 text-sm">جاري التحميل...</div>
        ) : aging.rows.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center gap-2 text-gray-400">
            <Clock size={30} className="text-gray-300" />
            <p className="font-medium text-gray-500">لا توجد مبالغ مستحقة</p>
            <p className="text-xs">كل الفواتير الصادرة مسدَّدة بالكامل</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4">
              {BUCKETS.map((b) => (
                <div key={b} className={`p-3 rounded-2xl border border-gray-100 ${BUCKET_COLORS[b]}`}>
                  <p className="text-xs opacity-80">{AGING_LABELS_AR[b]}</p>
                  <p className="text-lg font-black mt-1">{money(aging.totals[b])}</p>
                </div>
              ))}
              <div className="p-3 rounded-2xl bg-[#133B2E] text-white border border-[#133B2E]">
                <p className="text-xs text-[#D4AF37]">إجمالي المستحق</p>
                <p className="text-lg font-black mt-1">{money(aging.grandTotal)} <span className="text-xs font-normal">{currencySymbol}</span></p>
              </div>
            </div>

            <Table>
              <TableHeader className="bg-white">
                <TableRow>
                  <TableHead className="text-right font-bold text-[#133B2E]">العميل</TableHead>
                  {BUCKETS.map((b) => (
                    <TableHead key={b} className="text-right font-bold text-[#133B2E]">{AGING_LABELS_AR[b]}</TableHead>
                  ))}
                  <TableHead className="text-right font-bold text-[#133B2E]">الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.rows.map((r) => (
                  <TableRow key={r.clientId} className="hover:bg-gray-50/50">
                    <TableCell className="font-semibold text-[#133B2E]">{r.clientName}</TableCell>
                    {BUCKETS.map((b) => (
                      <TableCell key={b} className={r.buckets[b] > 0 ? "font-bold" : "text-gray-300"}>
                        {r.buckets[b] > 0 ? money(r.buckets[b]) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="font-black text-[#D4AF37]">{money(r.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-gray-50 border-t-2">
                  <TableCell className="font-black text-[#133B2E]">الإجمالي</TableCell>
                  {BUCKETS.map((b) => (
                    <TableCell key={b} className="font-black text-[#133B2E]">{money(aging.totals[b])}</TableCell>
                  ))}
                  <TableCell className="font-black text-[#D4AF37]">{money(aging.grandTotal)} {currencySymbol}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {overdueInvoices.length > 0 && (
              <div className="p-4 border-t">
                <p className="font-bold text-sm text-[#133B2E] mb-2">
                  الفواتير المتأخرة ({overdueInvoices.length}) — الأقدم أولاً
                </p>
                <ul className="space-y-1">
                  {overdueInvoices.slice(0, 10).map((inv) => (
                    <li key={inv.id} className="flex items-center gap-2 text-xs p-2 rounded-xl bg-red-50 border border-red-100">
                      <span className="font-mono text-gray-500" dir="ltr">{inv.invoiceNumber}</span>
                      <span className="font-bold text-[#133B2E]">{inv.clientName}</span>
                      <span className="text-red-700 font-bold">متأخرة {daysOverdue(inv.dueDate)} يوم</span>
                      <span className="mr-auto font-black text-red-800">{money(inv.remainingAmount)} {currencySymbol}</span>
                      <Link to="/app/invoices" className="text-indigo-600 underline hover:no-underline">فتح</Link>
                    </li>
                  ))}
                </ul>
                {overdueInvoices.length > 10 && (
                  <p className="text-xs text-gray-400 mt-2">و{overdueInvoices.length - 10} فاتورة أخرى — افتح صفحة الفواتير للقائمة الكاملة.</p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
