const express = require('express');
const path = require('path'); // Import the path module
// const fetch = require('node-fetch');
const cors = require('cors');
const { access } = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000; // use any preferred port

// Enable CORS for all routes (optional if front-end is served by same origin)
app.use(cors());


// TMDb proxy route
app.get('/api/movies', async (req, res) => {
  const { genre, year, page, language } = req.query;

  const url = new URL('https://api.themoviedb.org/3/discover/movie');
  url.search = new URLSearchParams({
    include_adult: false,
    include_video: 'false',
    language: 'en-US',
    sort_by: 'popularity.desc',
    page: page || 1,
    ...(genre ? {with_genres: genre} : {}),
    ...(year ? {primary_release_year: year} : {}),
    ...(language ? {with_original_language: language} : {}),
  });


  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
      },
    });

    const data = await response.json();

    if(!response.ok) {
      console.error('TMDb Error:', data);
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching from TMDb:', error);
    res.status(500).json({error: 'Failed to fetch movies from TMDb.'})
  }
});


app.get('/api/genres', async (req, res) => {
  try {
    const response = await fetch('https://api.themoviedb.org/3/genre/movie/list', {
      method: "GET",
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
      },
    });

    const data = await response.json();
    if(!response.ok) return res.status(response.status).json(data);

    res.json(data); // TMDb returns { genres: [ {id, name}, ... ] }
  } catch (error) {
      console.error('Error fetching genres from TMDb:', error);
      res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

app.get('/api/languages', async (req,res) => {
  try {
    const response = await fetch('https://api.themoviedb.org/3/configuration/languages', {
      method: "GET",
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
      },
    });
    const data = await response.json();
    if(!response.ok) return res.status(response.status).json(data);

    res.json(data);
  } catch(error) {
      console.error('Error fetching languages from TMDb:', error);
      res.status(500).json({ error: 'Failed to fetch languages' });
  }
});

// MOVIE PROVIDERS ROUTE =============================================

let _fetch = global.fetch;
if (!_fetch) {
  _fetch = (...args) => import('node-fetch').then(m => m.default(...args));
}

const providersCache = new Map(); // in-memory simple cache
const PROVIDERS_TTL_MS = 1000 * 60 * 60; // 1 hour

app.get('/api/movie/:id/providers', async (req, res) => {
  const movieId = req.params.id;

  // Basic validation
  if (!/^\d+$/.test(movieId)) {
    return res.status(400).json({ error: 'Invalid movie id' });
  }

  // Check cache
  const cached = providersCache.get(movieId);
  if (cached && (Date.now() - cached.t) < PROVIDERS_TTL_MS) {
    return res.json({ id: movieId, gb: cached.gb });
  }

  const url = `https://api.themoviedb.org/3/movie/${movieId}/watch/providers`;

  try {
    const response = await _fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.error('TMDb providers error', response.status, body);
      return res.status(response.status).json({ error: 'TMDb error', details: body });
    }

    const data = await response.json();
    const results = data.results || {};
    const gb = results.GB || null;

    // Cache (store minimal)
    providersCache.set(movieId, { t: Date.now(), gb });

    return res.json({ id: movieId, gb });
  } catch (err) {
    console.error('Error fetching providers:', err);
    return res.status(500).json({ error: 'Failed to fetch providers' });
  }
});



// =====================================================================



  // Serve static files from the "assets" directory
app.use(express.static('assets'));
console.log('Static file serving middleware active');

// Serve main .html file
app.get('/', (req, res) => {
    console.log('Request for /');
    // res.sendFile(path.join(__dirname, 'assets', 'moviePicker.html'));
    res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/moviepicker', (req, res) => {
    console.log('Request for /moviepicker');
    res.sendFile(path.join(__dirname, 'assets', 'moviePicker.html'));
});

app.get('/about', (req, res) => {
    console.log('Request for /about');
    res.sendFile(path.join(__dirname, 'about.html'));
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});


