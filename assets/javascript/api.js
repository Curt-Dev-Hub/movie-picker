export async function fetchMovies({ genre, year, language, page = 1 }) {
  const params = new URLSearchParams({ genre, year, language, page });

  const response = await fetch(`/api/movies?${params.toString()}`);
  const data = await response.json();

  if (!response.ok) {
        throw new Error(data.status_message || "API Error");
    }
    return data;
}

export async function getRandomMovies(genre, year, quantity, language) {  
  const firstPage = await fetchMovies({ genre, year, language, page: 1});

  if(!firstPage.results || firstPage.results.length === 0) {
    throw new Error("No movies returned on random page.");
  }

  // Cap TMDb page response at 500 
  const maxPage = Math.min(firstPage.total_pages, 500);
  const randomPage = Math.floor(Math.random() * maxPage) + 1;

  const randomPageData = await fetchMovies({
    genre,
    year,
    language,
    page: randomPage
  });

  if(!randomPageData.results || randomPageData.results.length === 0) {
    throw new Error("No movies returned on random page");
  }

  // Randomise results and return quantity
  // Fisher-Yates algo
  const shuffled = [...randomPageData.results];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, quantity);
}
