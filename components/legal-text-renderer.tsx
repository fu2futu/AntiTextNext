export function renderLegalText(text: string) {
  return text.split("\n").map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <div key={index} className="h-4" />;
    }

    if (index === 0) {
      return (
        <h1 key={index} className="mb-6 text-2xl font-black text-gray-900">
          {trimmed}
        </h1>
      );
    }

    if (/^第\d+条/.test(trimmed) || trimmed === "附則") {
      return (
        <h2
          key={index}
          className="mt-8 mb-3 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm"
        >
          {trimmed}
        </h2>
      );
    }

    if (/^\d+\./.test(trimmed)) {
      return (
        <p key={index} className="mt-4 font-bold text-gray-900">
          {trimmed}
        </p>
      );
    }

    if (/^\(\d+\)/.test(trimmed)) {
      return (
        <p key={index} className="ml-4 text-sm leading-7 text-gray-700">
          {trimmed}
        </p>
      );
    }

    return (
      <p key={index} className="text-sm leading-7 text-gray-700">
        {trimmed}
      </p>
    );
  });
}
