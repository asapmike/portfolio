console.log('IT’S ALIVE!');

function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

export async function fetchJSON(url) {
    try {
        const response = await fetch(url);
        console.log(response);

        if (!response.ok) {
            throw new Error(`Failed to fetch projects: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching or parsing JSON data:', error);
        throw error;
    }
}

export async function fetchGithubData(username) {
    const url = `https://api.github.com/users/${username}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch GitHub data: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching or parsing GitHub data:', error);
        throw error;
    }
}

export async function fetchGithubRepoStarsTotal(username) {
    let totalStars = 0;
    let page = 1;

    while (true) {
        const url = `https://api.github.com/users/${username}/repos?per_page=100&page=${page}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch GitHub repos: ${response.statusText}`);
        }

        const repos = await response.json();
        for (const repo of repos) {
            totalStars += repo.stargazers_count ?? 0;
        }

        if (repos.length < 100) {
            break;
        }

        page += 1;
    }

    return totalStars;
}

export function renderProjects(project, containerElement, headingLevel = 'h2') {
    if (!(containerElement instanceof Element)) {
        throw new Error('renderProjects: containerElement must be a DOM Element');
    }

    containerElement.innerHTML = '';

    const projects = Array.isArray(project) ? project : [project];

    for (const p of projects) {
        const basePath =
            location.hostname === 'localhost' || location.hostname === '127.0.0.1'
                ? '/'
                : '/portfolio/';

        const isAbsoluteUrl =
            /^https?:\/\//i.test(p.image) ||
            p.image.startsWith('data:') ||
            p.image.startsWith('/');

        const imageSrc = isAbsoluteUrl
            ? p.image
            : basePath + String(p.image).replace(/^\.\/?/, '');

        const article = document.createElement('article');

        article.innerHTML = `
            <${headingLevel}>${p.title}</${headingLevel}>
            <img src="${imageSrc}" alt="${p.title}">
            <p>${p.description}</p>
        `;

        containerElement.appendChild(article);
    }
}

// Step 3.1: Automatic navigation menu
let pages = [
    { url: 'index.html', title: 'Home' },
    { url: 'projects/index.html', title: 'Projects' },
    { url: 'contact/index.html', title: 'Contact' },
    { url: 'resume/index.html', title: 'Resume' },
    { url: 'https://github.com/asapmike', title: 'GitHub' },
];

const BASE_PATH =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? '/' // Local server
        : '/portfolio/'; // GitHub Pages repo name

let nav = document.createElement('nav');
document.body.prepend(nav);

// Step 5 (Optional): Better contact form (mailto with percent-encoding)
let form = document.querySelector('form');
form?.addEventListener('submit', function (event) {
    event.preventDefault();

    let data = new FormData(form);
    let url = form.action;
    let params = [];

    for (let [name, value] of data) {
        params.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    }

    url += `?${params.join('&')}`;
    location.href = url;
});

// Step 3.2: Highlight current page + open external links in new tab
for (let p of pages) {
    let url = p.url;
    let title = p.title;

    url = !url.startsWith('http') ? BASE_PATH + url : url;

    let a = document.createElement('a');
    a.href = url;
    a.textContent = title;

    a.classList.toggle(
        'current',
        a.host === location.host && a.pathname === location.pathname,
    );

    if (a.host !== location.host) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    }

    nav.append(a);
}

// Step 4.2: Add HTML for the dark mode switch
// Put it inside the nav so it won't overlap on small screens.
nav.insertAdjacentHTML(
    'beforeend',
    `
        <label class="color-scheme">
            Theme:
            <select>
                <option value="light dark" selected>Automatic</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
            </select>
        </label>
    `,
);

// Step 4.4: Actually making it work
let select = nav.querySelector('.color-scheme select');

function setColorScheme(colorScheme) {
    select.value = colorScheme;
    document.documentElement.style.setProperty('color-scheme', colorScheme);
    localStorage.colorScheme = colorScheme;
}

if ('colorScheme' in localStorage) {
    setColorScheme(localStorage.colorScheme);
}

select.addEventListener('input', function (event) {
    console.log('color scheme changed to', event.target.value);
    setColorScheme(event.target.value);
});

export async function fetchGitHubData(username) {
    // return statement here
    return fetchJSON(`https://api.github.com/users/${username}`);
}