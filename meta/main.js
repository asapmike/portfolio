import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

let xScale;
let yScale;
let commits = [];
let filteredCommits = commits;
let lines = [];
let files = [];
let commitProgress = 100;
let timeScale;
let commitMaxTime;
let colors = d3.scaleOrdinal(d3.schemeTableau10);

async function loadData() {
    const data = await d3.csv('loc.csv', (row) => ({
        ...row,
        line: Number(row.line),
        depth: Number(row.depth),
        length: Number(row.length),
        date: new Date(row.date + 'T00:00' + row.timezone),
        datetime: new Date(row.datetime),
    }));

    console.log(data);
    return data;
}

function processCommits(data) {
    return d3
        .groups(data, (d) => d.commit)
        .map(([commit, lines]) => {
            let first = lines[0];
            let { author, date, time, timezone, datetime } = first;
            let ret = {
                id: commit,
                url: 'https://github.com/asapmike/portfolio/commit/' + commit,
                author,
                date,
                time,
                timezone,
                datetime,
                hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
                totalLines: lines.length,
            };

            Object.defineProperty(ret, 'lines', {
                value: lines,
                configurable: true,
                writable: true,
                enumerable: false,
            });

            return ret;
        })
        .sort((a, b) => d3.ascending(a.datetime, b.datetime));
}

function renderCommitInfo(data, commits) {
    const fileLengths = d3.rollups(
        data,
        (lines) => lines.length,
        (d) => d.file,
    );
    const longestFile = d3.greatest(fileLengths, (d) => d[1]);
    const maxDepth = d3.max(data, (d) => d.depth);
    const formatNumber = d3.format(',');
    const formatDecimal = d3.format(',.1f');

    const stats = [
        ['Total <abbr title="Lines of code">LOC</abbr>', formatNumber(data.length)],
        ['Total commits', formatNumber(commits.length)],
        ['Files', formatNumber(fileLengths.length)],
        ['Longest file', `${longestFile[0]} (${formatNumber(longestFile[1])} lines)`],
        ['Average line length', `${formatDecimal(d3.mean(data, (d) => d.length))} chars`],
        ['Maximum depth', formatNumber(maxDepth)],
    ];

    const dl = d3.select('#stats').html('').append('dl').attr('class', 'stats');

    for (const [label, value] of stats) {
        dl.append('dt').html(label);
        dl.append('dd').text(value);
    }
}

function renderTooltipContent(commit) {
    const link = document.getElementById('commit-link');
    const date = document.getElementById('commit-date');
    const time = document.getElementById('commit-tooltip-time');
    const author = document.getElementById('commit-author');
    const lines = document.getElementById('commit-lines');

    if (Object.keys(commit).length === 0) return;

    link.href = commit.url;
    link.textContent = commit.id;
    date.textContent = commit.datetime?.toLocaleString('en', {
        dateStyle: 'full',
    });
    time.textContent = commit.datetime?.toLocaleString('en', {
        timeStyle: 'short',
    });
    author.textContent = commit.author;
    lines.textContent = d3.format(',')(commit.totalLines);
}

function updateTooltipVisibility(isVisible) {
    const tooltip = document.getElementById('commit-tooltip');
    tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
    const tooltip = document.getElementById('commit-tooltip');
    tooltip.style.left = `${event.clientX + 12}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
}

function createBrushSelector(svg) {
    svg.call(d3.brush().on('start brush end', brushed));
    svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
    const selection = event.selection;
    d3.selectAll('.dots circle').classed('selected', (d) =>
        isCommitSelected(selection, d),
    );
    renderSelectionCount(selection);
    renderLanguageBreakdown(selection);
}

function isCommitSelected(selection, commit) {
    if (!selection) {
        return false;
    }

    const [[x0, y0], [x1, y1]] = selection;
    const x = xScale(commit.date);
    const y = yScale(commit.hourFrac);

    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function getSelectedCommits(selection) {
    return selection ? commits.filter((d) => isCommitSelected(selection, d)) : [];
}

function renderSelectionCount(selection) {
    const selectedCommits = getSelectedCommits(selection);
    const countElement = document.querySelector('#selection-count');
    countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;

    return selectedCommits;
}

function renderLanguageBreakdown(selection) {
    const selectedCommits = getSelectedCommits(selection);
    const container = document.getElementById('language-breakdown');

    if (selectedCommits.length === 0) {
        container.innerHTML = '';
        return;
    }

    const lines = selectedCommits.flatMap((d) => d.lines);
    const breakdown = d3.rollup(
        lines,
        (v) => v.length,
        (d) => d.type,
    );

    container.innerHTML = '';

    for (const [language, count] of breakdown) {
        const proportion = count / lines.length;
        const formatted = d3.format('.1~%')(proportion);

        container.insertAdjacentHTML(
            'beforeend',
            `
                <dt>${language}</dt>
                <dd>${count} lines (${formatted})</dd>
            `,
        );
    }
}

function updateFileDisplay(filteredCommits) {
    lines = filteredCommits.flatMap((d) => d.lines);
    files = d3
        .groups(lines, (d) => d.file)
        .map(([name, lines]) => {
            return { name, lines };
        })
        .sort((a, b) => b.lines.length - a.lines.length);

    const previousPositions = new Map();
    d3.select('#files')
        .selectAll('.file-row')
        .each(function (d) {
            previousPositions.set(d.name, this.getBoundingClientRect().top);
        });

    const filesContainer = d3
        .select('#files')
        .selectAll('.file-row')
        .data(files, (d) => d.name)
        .join(
            (enter) =>
                enter
                    .append('div')
                    .attr('class', 'file-row')
                    .style('opacity', 0)
                    .call((div) => {
                        const dt = div.append('dt');
                        dt.append('code');
                        dt.append('small');
                        div.append('dd');
                    })
                    .call((enter) =>
                        enter.transition().duration(200).style('opacity', 1),
                    ),
            (update) => update,
            (exit) =>
                exit
                    .transition()
                    .duration(200)
                    .style('opacity', 0)
                    .remove(),
        );

    filesContainer.order();
    filesContainer.each(function (d) {
        const previousTop = previousPositions.get(d.name);
        if (previousTop === undefined) return;

        const currentTop = this.getBoundingClientRect().top;
        const dy = previousTop - currentTop;
        if (dy === 0) return;

        d3.select(this)
            .style('transform', `translateY(${dy}px)`)
            .transition()
            .duration(350)
            .style('transform', 'translateY(0)');
    });

    filesContainer.select('dt > code').text((d) => d.name);
    filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);
    filesContainer
        .select('dd')
        .selectAll('.loc')
        .data((d) => d.lines, (d) => `${d.commit}-${d.file}-${d.line}`)
        .join(
            (enter) =>
                enter
                    .append('div')
                    .attr('class', 'loc')
                    .style('opacity', 0)
                    .style('transform', 'scale(0)')
                    .call((enter) =>
                        enter
                            .transition()
                            .duration(200)
                            .style('opacity', 1)
                            .style('transform', 'scale(1)'),
                    ),
            (update) => update,
            (exit) =>
                exit
                    .transition()
                    .duration(200)
                    .style('opacity', 0)
                    .style('transform', 'scale(0)')
                    .remove(),
        )
        .attr('class', 'loc')
        .style('--color', (d) => colors(d.type));
}

function createXAxis() {
    const [start, end] = xScale.domain();
    const dayCount = Math.max(
        1,
        d3.timeDay.count(d3.timeDay.floor(start), d3.timeDay.ceil(end)),
    );
    const tickStep = Math.max(1, Math.ceil(dayCount / 8));

    return d3
        .axisBottom(xScale)
        .ticks(d3.timeDay.every(tickStep))
        .tickFormat(d3.timeFormat('%b %d'));
}

function renderScatterPlot(data, commits) {
    const width = 1000;
    const height = 600;
    const margin = { top: 10, right: 10, bottom: 30, left: 20 };
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3
        .select('#chart')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    xScale = d3
        .scaleTime()
        .domain(d3.extent(commits, (d) => d.date))
        .range([usableArea.left, usableArea.right])
        .nice();

    yScale = d3
        .scaleLinear()
        .domain([0, 24])
        .range([usableArea.bottom, usableArea.top]);
    const timeColorScale = d3
        .scaleSequential()
        .domain([0, 24])
        .interpolator(
            d3.interpolateRgbBasis([
                '#173b78',
                '#4f8fd8',
                '#f2b45a',
                '#df7a35',
                '#173b78',
            ]),
        );
    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);
    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

    const xAxis = createXAxis();
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

    const gridlines = svg
        .append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`);

    gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));
    gridlines
        .selectAll('line')
        .attr('stroke', (d) => timeColorScale(d))
        .attr('stroke-opacity', 0.45);

    svg
        .append('g')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .attr('class', 'x-axis')
        .call(xAxis);

    svg
        .append('g')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .attr('class', 'y-axis')
        .call(yAxis);

    const dots = svg.append('g').attr('class', 'dots');

    dots
        .selectAll('circle')
        .data(sortedCommits, (d) => d.id)
        .join('circle')
        .attr('cx', (d) => xScale(d.date))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', (d) => rScale(d.totalLines))
        .attr('fill', 'steelblue')
        .style('fill-opacity', 0.7)
        .on('mouseenter', (event, commit) => {
            d3.select(event.currentTarget).style('fill-opacity', 1);
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on('mousemove', (event) => {
            updateTooltipPosition(event);
        })
        .on('mouseleave', (event) => {
            d3.select(event.currentTarget).style('fill-opacity', 0.7);
            updateTooltipVisibility(false);
        });

    createBrushSelector(svg);
}

function updateScatterPlot(data, commits) {
    const width = 1000;
    const height = 600;
    const margin = { top: 10, right: 10, bottom: 30, left: 20 };
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3.select('#chart').select('svg');

    xScale = xScale.domain(d3.extent(commits, (d) => d.date)).nice();

    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);
    const xAxis = createXAxis();
    const xAxisGroup = svg.select('g.x-axis');

    xAxisGroup.selectAll('*').remove();
    xAxisGroup.call(xAxis);

    const dots = svg.select('g.dots');
    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

    dots
        .selectAll('circle')
        .data(sortedCommits, (d) => d.id)
        .join('circle')
        .attr('cx', (d) => xScale(d.date))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', (d) => rScale(d.totalLines))
        .attr('fill', 'steelblue')
        .style('fill-opacity', 0.7)
        .on('mouseenter', (event, commit) => {
            d3.select(event.currentTarget).style('fill-opacity', 1);
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on('mousemove', (event) => {
            updateTooltipPosition(event);
        })
        .on('mouseleave', (event) => {
            d3.select(event.currentTarget).style('fill-opacity', 0.7);
            updateTooltipVisibility(false);
        });
}

function updateFilteredCommits(maxTime) {
    const time = document.getElementById('commit-time');

    commitMaxTime = maxTime;
    commitProgress = timeScale(commitMaxTime);
    filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
    time.textContent = commitMaxTime.toLocaleString('en', {
        dateStyle: 'long',
        timeStyle: 'short',
    });

    return filteredCommits;
}

function updateScatterVisualizations(maxTime) {
    const filteredCommits = updateFilteredCommits(maxTime);

    updateScatterPlot(data, filteredCommits);
}

function updateFileVisualizations(maxTime) {
    const filteredCommits = updateFilteredCommits(maxTime);

    updateFileDisplay(filteredCommits);
}

function renderCommitStory(commits) {
    d3.select('#scatter-story')
        .selectAll('.step')
        .data(commits, (d) => d.id)
        .join('div')
        .attr('class', 'step')
        .html(
            (d, i) => `
                <p>
                    On ${d.datetime.toLocaleString('en', {
                        dateStyle: 'full',
                        timeStyle: 'short',
                    })}, I made
                    <a href="${d.url}" target="_blank" rel="noopener noreferrer">
                        ${i > 0 ? 'another commit' : 'my first commit'}
                    </a>.
                    I edited ${d.totalLines} lines across ${
                        d3.rollups(
                            d.lines,
                            (D) => D.length,
                            (d) => d.file,
                        ).length
                    } files.
                </p>
            `,
        );
}

function renderFileStory(commits) {
    d3.select('#files-story')
        .selectAll('.step')
        .data(commits, (d) => d.id)
        .join('div')
        .attr('class', 'step')
        .html(
            (d) => `
                <p>
                    By ${d.datetime.toLocaleString('en', {
                        dateStyle: 'long',
                        timeStyle: 'short',
                    })}, the repository included edits across
                    ${d3.rollups(
                        commits
                            .filter((commit) => commit.datetime <= d.datetime)
                            .flatMap((commit) => commit.lines),
                        (D) => D.length,
                        (line) => line.file,
                    ).length} files.
                    The file-size race updates one commit at a time, with each dot
                    representing one line of code.
                </p>
            `,
        );
}

function onScatterStepEnter(response) {
    updateScatterVisualizations(response.element.__data__.datetime);
}

function onFilesStepEnter(response) {
    updateFileVisualizations(response.element.__data__.datetime);
}

let data = await loadData();
commits = processCommits(data);
filteredCommits = commits;
timeScale = d3
    .scaleTime()
    .domain([
        d3.min(commits, (d) => d.datetime),
        d3.max(commits, (d) => d.datetime),
    ])
    .range([0, 100]);

console.log(commits);
renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
renderCommitStory(commits);
renderFileStory(commits);
updateFileVisualizations(commits[0].datetime);
updateScatterVisualizations(commits[0].datetime);

const scatterScroller = scrollama();
scatterScroller
    .setup({
        container: '#scrolly-1',
        step: '#scrolly-1 .step',
        offset: 0,
    })
    .onStepEnter(onScatterStepEnter);

const filesScroller = scrollama();
filesScroller
    .setup({
        container: '#scrolly-2',
        step: '#scrolly-2 .step',
        offset: 0,
    })
    .onStepEnter(onFilesStepEnter);
