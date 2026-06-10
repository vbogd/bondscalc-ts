import { ArrowLeft, Search } from "lucide-react";
import { Link, useParams } from "react-router-dom";

type ResultRow = {
  label: string;
  value: string;
  strong?: boolean;
};

const resultRows: ResultRow[] = [
  { label: "доходность, год", value: "15.47 %", strong: true },
  { label: "тек. доходность", value: "8.94 %" },
  { label: "прибыль", value: "836.83 ₽" },
  { label: "срок, дней", value: "3 325" },
];

export function CalculatorPage() {
  const { secid = "SU26233RMFS5" } = useParams();

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            className="mb-2 inline-flex size-10 items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 shadow-sm"
            to="/"
            aria-label="Назад к поиску"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
          <h1 className="truncate text-3xl font-semibold tracking-normal text-neutral-950">
            ОФЗ 26233
          </h1>
          <p className="text-lg text-neutral-500">RU000A101F94</p>
        </div>
        <Link
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-700 shadow-sm"
          to="/"
          aria-label="Поиск облигаций"
        >
          <Search className="size-5" aria-hidden="true" />
        </Link>
      </header>

      <p className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-600">
        SECID: {secid}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="номинал" value="1000" />
        <NumberField label="купон" value="6,1" />
        <NumberField label="комиссия" value="0,05" />
        <NumberField label="налог" value="13" />
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-neutral-950">Покупка</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="дата" value="10.06.2026" />
          <NumberField label="цена" value="59,341" />
        </div>
      </div>

      <div className="grid grid-cols-3 rounded-lg border border-neutral-300 bg-white p-1 text-sm font-semibold">
        <button className="rounded-md bg-blue-600 px-2 py-3 text-white" type="button">
          Погашение
        </button>
        <button className="rounded-md px-2 py-3 text-neutral-600" type="button">
          Оферта
        </button>
        <button className="rounded-md px-2 py-3 text-neutral-600" type="button">
          Продажа
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="дата" value="18.07.2035" />
        <NumberField label="цена" value="100" />
      </div>

      <section className="overflow-hidden rounded-lg border border-neutral-300 bg-white">
        <h2 className="border-b border-neutral-200 px-4 py-4 text-xl font-semibold text-neutral-950">
          Результаты
        </h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 px-4 py-5 text-xl">
          {resultRows.map((row) => (
            <ResultItem key={row.label} {...row} />
          ))}
        </dl>
      </section>
    </section>
  );
}

function NumberField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block rounded-lg border border-neutral-300 bg-white px-3 py-3 shadow-sm">
      <span className="block text-sm font-semibold uppercase text-neutral-500">
        {label}
      </span>
      <input
        className="mt-1 w-full border-0 bg-transparent text-2xl text-neutral-950 outline-none"
        defaultValue={value}
      />
    </label>
  );
}

function ResultItem({ label, value, strong = false }: ResultRow) {
  return (
    <>
      <dt className="text-neutral-700">{label}</dt>
      <dd className={strong ? "font-semibold text-neutral-950" : "text-neutral-950"}>
        {value}
      </dd>
    </>
  );
}
