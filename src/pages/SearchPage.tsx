import { Calculator, Search } from "lucide-react";
import { Link } from "react-router-dom";

const previewBonds = [
  {
    secid: "SU26233RMFS5",
    shortName: "ОФЗ 26233",
    isin: "RU000A101F94",
    maturity: "18.07.2035",
    coupon: "30.42 ₽",
    price: "59.34",
    yield: "14.64 %",
  },
  {
    secid: "SU26229RMFS3",
    shortName: "ОФЗ 26229",
    isin: "RU000A100EG3",
    maturity: "12.11.2025",
    coupon: "36.15 ₽",
    price: "99.12",
    yield: "13.02 %",
  },
];

export function SearchPage() {
  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <p className="text-sm font-medium text-emerald-700">MOEX bonds</p>
        <h1 className="text-3xl font-semibold tracking-normal text-neutral-950">
          Поиск облигаций
        </h1>
      </header>

      <label className="flex h-14 items-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
        <Search className="size-5 shrink-0 text-neutral-500" aria-hidden="true" />
        <span className="sr-only">Поиск</span>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-xl text-neutral-950 outline-none placeholder:text-neutral-400"
          placeholder="26233 или RU000A101F94"
          type="search"
        />
      </label>

      <div className="divide-y divide-neutral-200 border-y border-neutral-200">
        {previewBonds.map((bond) => (
          <Link
            className="block py-5 transition-colors hover:bg-white focus-visible:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
            key={bond.secid}
            to={`/bond/${bond.secid}`}
          >
            <article className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold text-neutral-950">
                    {bond.shortName}
                  </h2>
                  <p className="text-base text-neutral-500">{bond.isin}</p>
                </div>
                <Calculator
                  className="mt-1 size-5 shrink-0 text-neutral-500"
                  aria-hidden="true"
                />
              </div>

              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-lg">
                <dt className="text-neutral-500">Погашение</dt>
                <dd className="font-medium text-neutral-950">{bond.maturity}</dd>
                <dt className="text-neutral-500">Купон</dt>
                <dd className="font-medium text-neutral-950">{bond.coupon}</dd>
                <dt className="text-neutral-500">Тек. доходность</dt>
                <dd className="font-semibold text-neutral-950">{bond.yield}</dd>
                <dt className="text-neutral-500">Цена</dt>
                <dd className="font-medium text-neutral-950">{bond.price}</dd>
              </dl>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
