import { getRandomMovies, fetchMovies } from "./api.js";
let renderedMovieIds = new Set();


export function renderShortlist() {
    const shortlistContainer = document.getElementById("shortlist-container");
    const shortlist = JSON.parse(sessionStorage.getItem("shortlist")) || [];

    shortlistContainer.innerHTML = "";

    if (shortlist.length === 0) {
        shortlistContainer.innerHTML = `<p class="empty-shortlist">No movies selected yet.</p>`;
        updateSpinButton();
        return;
    }

    shortlist.forEach(movie => {
        const card = document.createElement("div");
        card.classList.add("shortlist-card");

        card.innerHTML = `
            <img src="${movie.posterPath}" alt="${movie.title}">
            <div class="shortlist-info">
                <h4>${movie.title}</h4>
                <p>${movie.release_year}</p>
            </div>
            <div class="shortlist-actions">
                <button class="movie-info-btn" data-id="${movie.id}">More info</button>
                <button class="remove-btn" data-id="${movie.id}">✕</button>
            </div>
            
        `;
        // <button class="remove-btn" data-id="${movie.id}">✕</button> - was by itself below .shortlist-info div
        shortlistContainer.appendChild(card);

        // after appending the card, add listener:
        card.querySelector('.movie-info-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.currentTarget.dataset.id;
            openMovieInfoModal(id);
        });
    });

    // Remove button logic
    document.querySelectorAll(".remove-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = parseInt(e.target.dataset.id, 10);
            removeFromShortlist(id);
        });
    });

    updateSpinButton();
}

// ** new update **
export function removeFromShortlist(movieId) {
    let shortlist = JSON.parse(sessionStorage.getItem("shortlist")) || [];
    shortlist = shortlist.filter(m => m.id !== movieId);

    sessionStorage.setItem("shortlist", JSON.stringify(shortlist));

    renderShortlist();
    // Remove highlight from main movie cards
    const movieCard = document.querySelector(
        `.single-film-wrapper[data-id="${movieId}"]`
    );

    if (movieCard) {
        movieCard.classList.remove("selected");
    }
    restoreSelectedCardStates();
}

function syncShortListedOnRender(wrapper, movieId) {
    const shortlist = JSON.parse(sessionStorage.getItem("shortlist")) || [];
    if(shortlist.some(m => m.id === movieId)) {
        wrapper.classList.add("selected");
    }
}

export function updateSpinButton() {
    const shortlist = JSON.parse(sessionStorage.getItem("shortlist")) || [];
    const spinBtn = document.getElementById("spin-wheel-btn");

    if (!spinBtn) return;

    spinBtn.classList.toggle("hidden", shortlist.length < 2);
}

function restoreSelectedCardStates() {
    const shortlist = JSON.parse(sessionStorage.getItem("shortlist")) || [];

    shortlist.forEach(item => {
        const card = document.querySelector(`.film-wrapper[data-id="${item.id}"]`);
        if (card) card.classList.add("selected");
    });
}

// replace broken image link
function safePosterURL(movie) {
    if (!movie.poster_path) {
        return "/pictures/movie_image_fallback_small_1.png";  // your custom placeholder
    }
    return `https://image.tmdb.org/t/p/w342${movie.poster_path}`;
}

// limit amount of words for movie description
function truncateWords(text, maxWords = 30, movie) {
    if (!text) return "No description available.";

    const words = text.split(" ");

    if (words.length <= maxWords) return text;

    // return words.slice(0, maxWords).join(" ") + "…";
    return `${words.slice(0, maxWords).join(" ")}...
    <button class="see-more-btn" data-movie-id="${movie.id}">See more</button>`;
}


function openMovieModal(movieId) {
    const movie = movieCache[movieId];
    if (!movie) return;

    document.getElementById("modalPoster").src =
        movie.poster_path
        ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
        : "/pictures/movie_image_fallback_small_1.png";

    document.getElementById("modalTitle").textContent = movie.title;
    document.getElementById("modalYear").textContent =
        movie.release_date ? movie.release_date.split("-")[0] : "N/A";

    document.getElementById("modalRating").textContent =
        `⭐ ${movie.vote_average.toFixed(1)} (${movie.vote_count} votes)`;

    document.getElementById("modalOverview").textContent = movie.overview;

    document.getElementById("movieModal").classList.remove("hidden");
}

//   CLOSE MOVIE MODAL
document.getElementById("movieModalClose").onclick = () => {
    document.getElementById("movieModal").classList.add("hidden");
};

document.getElementById("movieModal").onclick = (e) => {
    if (e.target.id === "movieModal") {
        document.getElementById("movieModal").classList.add("hidden");
    }
};


// global state - handling chosen filters, and page numbers from response
let currentFilters = null;
let currentPage = 1;
let maxPages = 1;
let state = false;
let movieCache = {};



// Extra movie info / external TMDb links - NEW 05/12/1983 ===============================================================
const providerCache = new Map();

function slugifyTitle(title) {
  return String(title || '').toLowerCase()
    .replace(/[^\w\s-]/g, '')       // remove punctuation
    .trim()
    .replace(/\s+/g, '-');          // spaces -> hyphens
}

function buildTmdbUrl(id, title) {
  const slug = slugifyTitle(title || '');
  return `https://www.themoviedb.org/movie/${id}${slug ? '-' + slug : ''}?language=en-GB`;
}

// Render a single provider item (logo + name)
function makeProviderItem(p) {
  const div = document.createElement('div');
  div.className = 'provider-item';
  if (p.logo_path) {
    const img = document.createElement('img');
    img.src = `https://image.tmdb.org/t/p/w92${p.logo_path}`;
    img.alt = p.provider_name;
    div.appendChild(img);
  }
  const span = document.createElement('span');
  span.textContent = p.provider_name;
  div.appendChild(span);
  return div;
}

async function fetchProviders(movieId) {
  if (providerCache.has(movieId)) return providerCache.get(movieId);
  try {
    const resp = await fetch(`/api/movie/${movieId}/providers`);
    if (!resp.ok) throw new Error('Providers request failed');
    const json = await resp.json();
    const gb = json.gb || null;
    providerCache.set(movieId, gb);
    return gb;
  } catch (err) {
    console.error('Error fetching providers', err);
    providerCache.set(movieId, null); // avoid repeated failing calls in the session
    return null;
  }
}

async function openMovieInfoModal(movieId) {
  const modal = document.getElementById('movie-info-modal');
  const backdrop = document.getElementById('movie-info-backdrop');
  const titleEl = document.getElementById('movie-info-title');
  const tmdbLink = document.getElementById('movie-tmdb-link');
  const tmdbLinkCta = document.getElementById('movie-tmdb-link-cta');
  const loadingEl = document.getElementById('movie-info-loading');
  const bodyEl = document.getElementById('movie-info-body');
  const providerContainer = document.getElementById('provider-container');
  const fallbackEl = document.getElementById('movie-info-fallback');

  // Get movie metadata from your cache (you already populate movieCache in renderMovies)
  const movie = (window.movieCache && movieCache[movieId]) ? movieCache[movieId] : null;
  const title = movie ? (movie.title || movie.original_title || 'Movie') : 'Movie';

  // Set title and TMDb link immediately
  titleEl.textContent = title;
  const tmdbUrl = buildTmdbUrl(movieId, title);
  tmdbLink.href = tmdbUrl;
  tmdbLinkCta.href = tmdbUrl;

  // Show modal and loading state
  modal.classList.remove('hidden');
  loadingEl.classList.remove('hidden');
  bodyEl.classList.add('hidden');
  fallbackEl.classList.add('hidden');
  providerContainer.innerHTML = '';

  // Fetch providers
  const gb = await fetchProviders(movieId);

  loadingEl.classList.add('hidden');

  if (!gb || (Object.keys(gb).length === 0)) {
    // No UK providers
    fallbackEl.classList.remove('hidden');
    bodyEl.classList.remove('hidden');
    return;
  }

  // Render provider groups (flatrate, free, rent, buy, ads)
  bodyEl.classList.remove('hidden');

  const groups = [
    { key: 'flatrate', title: 'Streaming (Subscription)' },
    { key: 'free', title: 'Free' },
    { key: 'ads', title: 'Free with Ads' },
    { key: 'rent', title: 'Rent' },
    { key: 'buy', title: 'Buy' }
  ];

  groups.forEach(g => {
    const arr = gb[g.key];
    if (Array.isArray(arr) && arr.length) {
      const groupEl = document.createElement('div');
      groupEl.className = 'provider-group';
      const h = document.createElement('h4');
      h.textContent = g.title;
      groupEl.appendChild(h);
      const list = document.createElement('div');
      list.className = 'provider-list';

      // Sort by display_priority if present
      arr.sort((a,b) => (a.display_priority || 9999) - (b.display_priority || 9999));

      arr.forEach(p => {
        const item = makeProviderItem(p);
        list.appendChild(item);
      });

      groupEl.appendChild(list);
      providerContainer.appendChild(groupEl);
    }
  });

  // Also offer the TMDb watch page link (if present in gb.link)
  if (gb.link) {
    const linkBlock = document.createElement('div');
    linkBlock.style.marginTop = '10px';
    linkBlock.innerHTML = `<a class="movie-info-btn" href="${gb.link}" target="_blank" rel="noopener noreferrer">Open provider page on TMDb</a>`;
    providerContainer.appendChild(linkBlock);
  }
}

// Modal close handlers
document.getElementById('movie-info-close').addEventListener('click', () => {
  document.getElementById('movie-info-modal').classList.add('hidden');
});
document.getElementById('movie-info-close-cta').addEventListener('click', () => {
  document.getElementById('movie-info-modal').classList.add('hidden');
});
document.getElementById('movie-info-backdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('movie-info-modal').classList.add('hidden');
  }
});

// ==========================================================================================

// function to check width
function checkWidthAndApplyClass() {
    const screenwidth = window.innerWidth = window.innerWidth;
    const parentElement = document.querySelector('#provider-container');

    if(parentElement) {
        const fourthChild = parentElement.children[3];

        if(fourthChild) {
            if(screenwidth <= 650) {
                fourthChild.classList.add('provider-group');
            } else {
                fourthChild.classList.remove('provider-group');
            }
        }
    }
}

checkWidthAndApplyClass();
window.addEventListener('resize', checkWidthAndApplyClass);



// let fetchedMovieIds = new Set();
const genreContainer = document.getElementById("genre-selectors");
const loadMoreBtns = Array.from(document.querySelectorAll(".loadMoreBtn"));
const formSubmit = document.getElementById('form-submit');
const feedbackForm = document.getElementById('feedback-form'); 

const feedbackBtn = document.getElementById('feedback');
const feedbackOverlay = document.getElementById('feedback-overlay');
const closeFeedback = document.getElementById('close-feedback');
const scrollTopBtn = document.getElementById("scrollTopBtn");


window.addEventListener("scroll", () => {
    if (window.scrollY > 500) { // adjust threshold as needed
        scrollTopBtn.classList.add("show");
        scrollTopBtn.classList.remove("hidden");
    } else {
        scrollTopBtn.classList.remove("show");
    }
});

scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});


// Show form and overlay
feedbackBtn.addEventListener('click', () => {
  feedbackForm.classList.remove('hidden');
  feedbackOverlay.classList.remove('hidden');
});

// Hide form and overlay when clicking close button
closeFeedback.addEventListener('click', () => {
  feedbackForm.classList.add('hidden');
  feedbackOverlay.classList.add('hidden');
});

// Hide form and overlay when clicking overlay
feedbackOverlay.addEventListener('click', () => {
  feedbackForm.classList.add('hidden');
  feedbackOverlay.classList.add('hidden');
});

// random movie winner modal close event listener
document.getElementById("winner-close").addEventListener("click", () => {
    document.getElementById("winner-modal").classList.add("hidden");
});

// helper functions
function disableLoadMoreButton() {
    loadMoreBtns.forEach(btn => btn.classList.add("hidden"));
}

function enableLoadMoreButton() {
    // loadMoreBtn.removeAttribute("disabled");
    loadMoreBtns.forEach(btn => btn.classList.remove("hidden"));
}

function showLoadingSpinner() {
    loadMoreBtns.forEach(btn => btn.textContent = "Loading...");
}

function hideLoadingSpinner() {
    loadMoreBtns.forEach(btn => btn.textContent = "Load More");
}

const refreshMovies = () => {
    const parent = document.querySelector(".random-movie-set");
    parent.innerHTML = "";
};

// Populate language and Genre selects -------------------------------------------
async function populateLanguages() {
    const languageSelect = document.getElementById('language');
    const response = await fetch('/api/languages');
    const data = await response.json();

    data.forEach((lang) => {
        const option = document.createElement('option');
        option.value = lang.iso_639_1;
        option.textContent = lang.english_name;
        if(lang.english_name === "English") { option.setAttribute("selected", true)} //pre select English
        languageSelect.appendChild(option);
    });
}

async function populateGenres(selectElement) {
    const response = await fetch('/api/genres'); // your API route
    const data = await response.json();
    console.log(data);

    data.genres.forEach(genre => {
        const option = document.createElement("option");
        option.value = genre.id;
        option.textContent = genre.name;
        selectElement.appendChild(option);
    });
}

// -----------------------------------------------------------------------------------------

async function createGenreSelect(index) {
    const select = document.createElement("select");
    select.id = `genre${index}`;
    select.name = `genre${index}`;
    select.classList.add("genre-select");

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    defaultOption.textContent = `Select genre ${index}`;
    select.appendChild(defaultOption);

    await populateGenres(select);
    return select;
}

// Call on page load
window.addEventListener('DOMContentLoaded', async () => {
//  populateGenres();
    populateLanguages();
    const firstSelect = await createGenreSelect(1);
    genreContainer.appendChild(firstSelect);
    document.querySelector("#genre1").addEventListener("change", syncGenreOptions);
    // ** new change **

    // Render stored shortlist
    renderShortlist();

    // Restore selected movie cards (if they exist on screen)
    restoreSelectedCardStates();
   
});

genreContainer.addEventListener("change", async (event) => {
    if (!event.target.classList.contains("genre-select")) return;

    const selects = document.querySelectorAll(".genre-select");

    // If genre1 selected → append genre2
    if (selects.length === 1 && selects[0].value !== "") {
        const second = await createGenreSelect(2);
        genreContainer.appendChild(second);
        // document.querySelector("#genre2").addEventListener("change", syncGenreOptions);
        second.addEventListener("change", syncGenreOptions);
        syncGenreOptions();
    }

    // If genre2 selected → append genre3
    if (selects.length === 2 && selects[1].value !== "") {
        const third = await createGenreSelect(3);
        genreContainer.appendChild(third);
        third.addEventListener("change", syncGenreOptions);
        syncGenreOptions();
    }
});

// prevent duplicate for select options 
function syncGenreOptions() {
    console.log("Sync'd Options!!");
    const allSelects = document.querySelectorAll(".genre-select");
    const selectedValues = [...allSelects].map(s => s.value).filter(Boolean);

    allSelects.forEach(select => {
        [...select.options].forEach(option => {
            if(option.value && selectedValues.includes(option.value) && option.value !== select.value) {
                option.disabled = true;
            } else {
                option.disabled = false;
            }
        });
    });
}

// =============== FORM SUBMISSION ===============
document.querySelector("#user-movie-form").addEventListener("submit", validateForm);

async function validateForm(event) {
    event.preventDefault();
    state = true;

    showSpinner();

    // const genre = document.getElementById("genre").value;
    const genreSelects = Array.from(document.querySelectorAll(".genre-select"));
    const genre  = genreSelects
        .map(s => s.value)
        .filter(Boolean)
        .join("|");
    const quantity = parseInt(document.getElementById("quantity").value);
    const year = document.getElementById("selected-year").value;
    const language = document.getElementById("language").value;

    if (!genre || genre === "Select Genre" || isNaN(quantity)) {
        alert("Please select both a Genre and a Number of movies 🙂");
        hideSpinner();
        return;
    }

    refreshMovies(); // check necessity
    enableLoadMoreButton();

    try {
        const movies = await getRandomMovies(genre, year, quantity, language);
        currentFilters = { genre, year, language, quantity }; // store for load-more
        currentPage = 1;
        maxPages = 500;

        movies.forEach(movie => renderMovies(movie));

        formSubmit.value = "Get More Movies";
        document.querySelector(".random-movie-set").scrollIntoView({ behavior: "smooth" });
    } catch (error) {
        state = false;
        alert("Could not fetch movies. Please try again later.");
    } finally {
        hideSpinner();
        console.log(renderedMovieIds);
        renderedMovieIds.clear();
    }
}


// =============== LAZY LOAD OBSERVER ===============
const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const image = entry.target;
            image.src = image.getAttribute("data-src");
            obs.unobserve(image);
        }
    });
});

const toggleShortlist = (event, movie) => {
    let shortlist = JSON.parse(sessionStorage.getItem("shortlist")) || [];

    const movieBasicInfo = {
        id: movie.id,
        title: movie.original_title,
        posterPath: `https://image.tmdb.org/t/p/w342${movie.poster_path}`,
        release_year: movie.release_date ? movie.release_date.split("-")[0] : "N/A"
    };

    const exists = shortlist.some(item => item.id === movieBasicInfo.id);

    if (exists) {
        shortlist = shortlist.filter(item => item.id !== movieBasicInfo.id);
    } else {
        if (shortlist.length >= 10) {
            alert("You can store up to 10 movies in your shortlist.");
            return;
        }
        shortlist.push(movieBasicInfo);
    }

    sessionStorage.setItem("shortlist", JSON.stringify(shortlist));

    // Toggle card appearance
    const wrapper = event.currentTarget;
    wrapper.classList.toggle("selected");

    renderShortlist();
};

// =============== MOVIE RENDERING ===============
function renderMovies(movie) {
    // Cache full movie object for modal use
    movieCache[movie.id] = movie;

    const container = document.querySelector(".random-movie-set");

    if(renderedMovieIds.has(movie.id)) return;
    renderedMovieIds.add(movie.id);    

    const wrapper = document.createElement("div");
    wrapper.classList.add("single-film-wrapper");
    // add dataset 
    wrapper.dataset.id = movie.id;

    // wrapper.addEventListener("click", (event) => toggleShortlist(event, movie));
    wrapper.addEventListener("click", (event) => {
        if (event.target.classList.contains('see-more-btn')) {
            event.stopPropagation();
            // Handle see more logic
            const movieId = parseInt(event.target.dataset.movieId, 10);

            openMovieModal(movieId);
            return; // Exit early
        }
        toggleShortlist(event, movie)
    });
    
    const inner = document.createElement("div");
    inner.classList.add("single-film-inner-wrapper");

    const img = document.createElement("img");
    img.setAttribute("data-src",
        safePosterURL(movie)
    );
    img.alt = movie.title || "No title available";
    img.classList.add("movie-pic-small");
    observer.observe(img);

    const title = document.createElement("h5");
    title.textContent = movie.title || "Untitled";

    const year = document.createElement("p");
    year.textContent = movie.release_date
        ? movie.release_date.split("-")[0]
        : "N/A";
    year.classList.add("movie-year");

    const overview = document.createElement("p");
    overview.innerHTML = truncateWords(movie.overview, 30, movie)
    overview.classList.add("film-description");

    const rating = document.createElement("p");
    rating.textContent = `⭐ ${movie.vote_average.toFixed(1)} (${movie.vote_count} votes)`;
    rating.classList.add("rating-text");

    inner.append(img, title, year, overview, rating);
    wrapper.append(inner);
    container.append(wrapper);

    requestAnimationFrame(() => {
        wrapper.classList.add("visible");
    });

    syncShortListedOnRender(wrapper, movie.id);
}


// =============== LOAD MORE MOVIES ===============
loadMoreBtns.forEach(btn => btn.addEventListener("click", loadMoreMovies));

async function loadMoreMovies() {
    console.log("loadMoreMovies Called")
    
    // below loads originally selected quantity of films only
    if (!currentFilters) return;

    showLoadingSpinner();
    showSpinner();

    try {
        const movies = await getRandomMovies(
            currentFilters.genre,
            currentFilters.year,
            currentFilters.quantity,    // ❤️ respect original quantity
            currentFilters.language
        );

        hideLoadingSpinner();

        if (!movies || movies.length === 0) {
            disableLoadMoreButton();
            return;
        }

        movies.forEach(movie => renderMovies(movie));

    } catch (err) {
        hideLoadingSpinner();
        disableLoadMoreButton();
        console.error("Load More Error:", err);
    } finally {
        hideSpinner();
    }
}


window.loadMoreMovies = loadMoreMovies;


// =============== FEEDBACK MODAL HANDLING ===============
document.addEventListener("click", function (event) {
    if (event.target.matches("#close-feedback") ||
        !event.target.closest("#feedback-form")) {
        closeModal();
    }
});

document.addEventListener("click", function (event) {
    if (event.target.matches("#feedback")) {
        openModal();
    }
});

function closeModal() {
    feedbackForm.style.display = "none";
}

function openModal() {
    feedbackForm.style.display = "flex";
}

function showSpinner() {
  document.getElementById('loading-spinner').classList.remove('hidden');
}

function hideSpinner() {
  document.getElementById('loading-spinner').classList.add('hidden');
}


// ========== WHEEL PICKER ==========
const wheelBtn = document.getElementById("spin-wheel-btn");
const wheelModal = document.getElementById("wheel-modal");
const wheelCanvas = document.getElementById("wheel-canvas");
const closeWheel = document.getElementById("close-wheel");
const spinBtn = document.getElementById("spin-btn");

let wheelCtx = wheelCanvas.getContext("2d");
let wheelAngles = [];
let isSpinning = false;

// ================ CONFETTI ====================
const confettiCanvas = document.getElementById("confetti-canvas");
const confettiCtx = confettiCanvas.getContext("2d");

const myConfetti = confetti.create(confettiCanvas, { resize: true });


function highlightWinnerSlice(index, shortlist) {
    const arcSize = (2 * Math.PI) / shortlist.length;
    const start = index * arcSize;
    const end = start + arcSize;

    // Glow
    wheelCtx.save();
    wheelCtx.beginPath();
    wheelCtx.moveTo(250, 250);
    wheelCtx.arc(250, 250, 250, start, end);
    wheelCtx.fillStyle = "rgba(255,255,0,0.4)";
    wheelCtx.fill();
    wheelCtx.lineWidth = 6;
    wheelCtx.strokeStyle = "#FFD700";
    wheelCtx.stroke();
    wheelCtx.restore();
}


wheelBtn.addEventListener("click", () => {
    wheelModal.classList.remove("hidden");
    drawWheel();
});

closeWheel.addEventListener("click", () => {
    wheelModal.classList.add("hidden");
});

function triggerPulse() {
    const pulse = document.getElementById("winner-pulse");
    pulse.classList.add("active");

    setTimeout(() => {
        pulse.classList.remove("active");
    }, 600);
}


// stores correct movie list inside wheelAngles
// prepares visual slices 
function drawWheel() {
    
    const shortlist = JSON.parse(sessionStorage.getItem("shortlist")) || [];
    const canvasSize = 500;
    wheelCanvas.width = canvasSize;
    wheelCanvas.height = canvasSize;
    wheelCtx.clearRect(0, 0, canvasSize, canvasSize);

    const arcSize = (2 * Math.PI) / shortlist.length;

    shortlist.forEach((movie, index) => {
        const start = index * arcSize;
        const end = start + arcSize;

        // Slice fill color / Create radial gradient
        const gradient = wheelCtx.createRadialGradient(250, 250, 50, 250, 250, 250);
        gradient.addColorStop(0, `hsl(${index * 360 / shortlist.length}, 70%, 60%)`);
        gradient.addColorStop(1, `hsl(${index * 360 / shortlist.length}, 70%, 40%)`);

        wheelCtx.beginPath();
        wheelCtx.moveTo(250, 250);
        wheelCtx.arc(250, 250, 250, start, end);
        wheelCtx.fillStyle = gradient;
        wheelCtx.fill();


        //Draw poster image in spin wheel - not correctly sizing atm
        // if(movie.posterPath) {
        //     const img = new Image();
        //     img.src = movie.posterPath;
        //     img.onload = () => {
        //         wheelCtx.save();
        //         wheelCtx.translate(canvasSize/2, canvasSize/2);
        //         wheelCtx.rotate(start + arcSize / 2);
        //         wheelCtx.drawImage(img, canvasSize/4, -25, 50, 75); // adjust size & offset
        //         wheelCtx.restore();
        //     };
        // }

        // Draw title along arc
        wheelCtx.save();
        wheelCtx.translate(canvasSize/2, canvasSize/2);
        wheelCtx.rotate(start + arcSize / 2);
        wheelCtx.textAlign = "right";
        wheelCtx.fillStyle = "#fff";
        wheelCtx.font = "14px sans-serif";

        // Wrap long titles
        const maxChars = 15;
        let title = movie.title.length > maxChars ? movie.title.slice(0, maxChars) + "…" : movie.title;
        wheelCtx.fillText(title, canvasSize/2 - 10, 5);
        wheelCtx.restore();
    });


    // wheelAngles = shortlist;  <-- not needed as shortlist is now read directly below
}

function finishSpin(angle) {
    const shortlist = JSON.parse(sessionStorage.getItem("shortlist")) || [];
    const sliceAngle = (2 * Math.PI) / shortlist.length;

    let normalized = (2 * Math.PI - (angle % (2 * Math.PI))) % (2 * Math.PI);
    let index = Math.floor(normalized / sliceAngle);

    const winner = shortlist[index];

    highlightWinnerSlice(index, shortlist);
    triggerPulse();

    // confetti
    confetti({
        particleCount: 200,
        startVelocity: 40,
        spread: 70,
        origin: { y: 0.6 }
    });

    // show modal
    document.getElementById("winner-title").textContent = winner.title;
    document.getElementById("winner-modal").classList.remove("hidden");
}

spinBtn.addEventListener("click", () => {
    if (isSpinning) return;
    isSpinning = true;

    const shortlist = JSON.parse(sessionStorage.getItem("shortlist")) || [];
    if (shortlist.length === 0) return;

    const sliceAngle = (2 * Math.PI) / shortlist.length;

    // --- Spin physics ---
    let angle = 0;
    let velocity = 0.45 + Math.random() * 0.2;   // initial high speed
    const friction = 0.985;                      // slow but natural deceleration

    function animate() {
        velocity *= friction;
        angle += velocity;

        // wheelCanvas.style.transform = `rotate(${angle}rad)`;
        wheelCanvas.style.transform = `rotate(${angle}rad) rotateX(10deg)`;
        

        if (velocity < 0.002) {
            // --- Stop spinning ---
            isSpinning = false;
            

            // Convert final angle to a winning slice
            let normalized = (2 * Math.PI - (angle % (2 * Math.PI))) % (2 * Math.PI);
            let index = Math.floor(normalized / sliceAngle);

            const winner = shortlist[index];
            
            // glowing winning movie
            highlightWinnerSlice(index, shortlist);

            myConfetti({
              particleCount: 200,
              spread: 80,
              startVelocity: 40,
              origin: { y: 0.3 },
            });

            triggerPulse();

             // Show Custom Modal
            document.getElementById("winner-title").textContent = winner.title;
            document.getElementById("winner-modal").classList.remove("hidden");

            setTimeout(() => {
              wheelModal.classList.add("hidden");
              console.log("wheel modal closed");
            }, 3500);
            return;
        }
        requestAnimationFrame(animate);
    };
    
    animate();
});


