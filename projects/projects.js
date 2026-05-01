import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

let query = '';
let selectedIndex = -1;
let selectedYear = null;

const projects = await fetchJSON('../lib/projects.json');
const svg = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');
const yearDomain = [...new Set(projects.map((project) => String(project.year)))].sort(
    (a, b) => Number(b) - Number(a),
);
const colors = d3
    .scaleOrdinal()
    .domain(yearDomain)
    .range(['#5B6CFF', '#2E8B87', '#7A8F3B', '#6D5BD0', '#3C7A9E', '#4B5563']);
const projectsTitle = document.querySelector('.projects-title');
const projectsContainer = document.querySelector('.projects');
const searchInput = document.querySelector('.searchBar');

function renderProjectsList(projectList) {
    projectsTitle.textContent = `Projects (${projectList.length})`;
    renderProjects(projectList, projectsContainer, 'h2');
}

function getQueryFilteredProjects(nextQuery = query) {
    query = nextQuery;

    return projects.filter((project) => {
        const values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });
}

function getVisibleProjects(projectList) {
    if (selectedYear === null) {
        return projectList;
    }

    return projectList.filter((project) => String(project.year) === String(selectedYear));
}

function renderPieChart(projectsGiven) {
    const rolledData = d3.rollups(
        projectsGiven,
        (values) => values.length,
        (project) => project.year,
    );
    rolledData.sort((a, b) => Number(b[0]) - Number(a[0]));
    const data = rolledData.map(([year, count]) => {
        return { value: count, label: year };
    });
    const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
    const sliceGenerator = d3.pie().value((d) => d.value);
    const arcData = sliceGenerator(data);
    const arcs = arcData.map((d) => arcGenerator(d));

    selectedIndex = data.findIndex((d) => String(d.label) === String(selectedYear));

    svg.selectAll('path').remove();
    legend.selectAll('li').remove();

    function toggleSelection(year, idx) {
        const isDeselecting = String(selectedYear) === String(year);

        selectedYear = isDeselecting ? null : year;
        selectedIndex = isDeselecting ? -1 : idx;
        updatePage();
    }

    arcs.forEach((arc, idx) => {
        svg.append('path')
            .attr('d', arc)
            .attr('fill', colors(String(data[idx].label)))
            .attr('class', idx === selectedIndex ? 'selected' : null)
            .on('click', () => {
                toggleSelection(data[idx].label, idx);
            });
    });

    data.forEach((d, idx) => {
        legend
            .append('li')
            .attr('style', `--color:${colors(String(d.label))}`)
            .attr(
                'class',
                idx === selectedIndex ? 'legend-item selected' : 'legend-item',
            )
            .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
            .on('click', () => {
                toggleSelection(d.label, idx);
            });
    });
}

function updatePage() {
    const queryFilteredProjects = getQueryFilteredProjects();
    const visibleProjects = getVisibleProjects(queryFilteredProjects);

    renderProjectsList(visibleProjects);
    renderPieChart(projects);
}

searchInput.addEventListener('input', (event) => {
    query = event.target.value;
    updatePage();
});

updatePage();
