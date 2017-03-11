$(function() {
  var localStorage = window.localStorage;

  function readSeries() {
    return JSON.parse(localStorage.getItem("series")) || [];
  }

  function writeSeries(series) {
    localStorage.setItem("series", JSON.stringify(series));
  }

  function findShow(showId, series) {
    return (series || readSeries()).find(s => s.id === showId);
  }

  function findCurrentSeason(show) {
    return show.seasons.find(s => s.number === show.currentSeason);
  }

  function findSeason(show, number) {
    return show.seasons.find(s => s.number === number);
  }

  function findCurrentEpisode(show) {
    const season = findCurrentSeason(show);
    return show.episodes.find(e => e.season === season.number && e.number === show.currentEpisode);
  }

  function getProgress(show) {
    const episode = findCurrentEpisode(show);
    return (((episode ? show.episodes.indexOf(episode) : show.episodes.length) / show.episodes.length)*100);
  }

  function countEpisodes(season, episodes) {
    let count = 0;
    episodes.forEach(episode => {
      if (season.number === episode.season) {
        count++;
      }
    });
    return count;
  }

  function renderShow(show) {
    const season = findCurrentSeason(show);
    const episode = findCurrentEpisode(show) || {
      number: show.currentEpisode,
    };
    const done = getProgress(show);
    return `
      <div class="serie">
        <div class="serie-image">
          <a href="http://www.imdb.com/title/${(show.externals || {}).imdb}" target="_blank">
          <span class="ui left green corner label">
            <span class="rotate-left done">${done.toFixed(2)}%</span>
          </span>
          <img src="${(season.image || show.image || {}).medium}" />
          </a>
        </div>
        <div class="toolbar">
          <button title="Next episode" class="next ui primary labeled icon button next-episode" data-show-id="${show.id}">
            <i class="unhide icon"></i>
            S${season.number}E${episode.number}
          </button>
          <button title="Jump to episode" class="ui icon right floated button jump-to-episode" data-show-id="${show.id}">
            <i class="setting icon"></i>
          </button>
          <button title="Delete series" class="ui icon right floated button delete-show" data-show-id="${show.id}">
            <i class="close icon"></i>
          </button>
        </div>
      </div>
    `;
  }

  function render() {
    const series = readSeries();
    if (series.length === 0) {
      $('#series').html(`<div>No shows have been added yet. Use search box above to add new shows</div>`);
      return;
    }
    const html = series.map(renderShow);
    $('#series').html(html);
  }

  function saveShow(id, currentEpisode, currentSeason) {
    $.ajax({
      url: 'http://api.tvmaze.com/shows/' + id + '?embed[]=episodes&embed[]=seasons'
    }).done(function(show) {
      const series = readSeries();
      const newShow = {
        id: show.id,
        name: show.name,
        image: show.image,
        summary: show.summary,
        seasons: show._embedded.seasons,
        episodes: show._embedded.episodes,
        currentEpisode: currentEpisode || 1,
        currentSeason: currentSeason || 1,
        genres: show.genres,
        externals: show.externals,
      };
      newShow.seasons.forEach(season => {
        season.episodeOrder = countEpisodes(season, newShow.episodes);
      });
      series.push(newShow);
      writeSeries(series);
      render();
    });
  }

  function refreshSeries() {
    const series = readSeries();
    Promise.all(series.map(serie => {
      return saveShow(serie.id, serie.currentEpisode, serie.currentSeason);
    })).then(render);
  }

  $('.main-search')
    .search({
      minCharacters: 3,
      apiSettings: {
        url: 'http://api.tvmaze.com/search/shows?q={query}',
        mockResponseAsync: function(settings, callback) {
          $.ajax({
            url: settings.url,
          }).done(function(response) {
            const results = {
              status: true,
              results: response.map(item => ({
                id: item.show.id,
                title: item.show.name,
                image: (item.show.image || {}).medium,
              })),
            };
            callback(results);
          });
        }
      },
      onSelect(result, response) {
        saveShow(result.id);
      }
    });

  $('#series').on('click', '.next-episode', function(e) {
    const showId = Number($(this).data('show-id'));
    const series = readSeries();
    const show = series.find(s => s.id === showId);
    const season = show.seasons.find(s => s.number === show.currentSeason);
    const episode = show.episodes.find(e => e.season === season.number && e.number === show.currentEpisode);
    if (!episode) {
      return; 
    }
    if (show.currentEpisode + 1 <= season.episodeOrder) {
      show.currentEpisode++;
    } else if (season.number < show.seasons.length) {
      show.currentSeason++;
      show.currentEpisode=1;
    }
    writeSeries(series);
    render();
  });

  $('#series').on('click', '.delete-show', function(e) {
    const showId = Number($(this).data('show-id'));
    const series = JSON.parse(localStorage.getItem("series")) || [];
    localStorage.setItem("series", JSON.stringify(series.filter(s => s.id !== showId)));
    render();
  });

  function getSeasonSelect(show) {
    return show.seasons.map(s => {
      return `<div class="item" data-value="${show.id}_${s.number}">${s.number}</div>`;
    });
  }

  function getEpisodeSelect(season) {
    return [...Array(season.episodeOrder)].map((s, i) => {
      return `<div class="item" data-value="${i+1}">${i+1}</div>`;
    });
  }

  function initDropdown(seasonSelect, episodeSelect) {
    $('#jump-dialog #season-dropdown .menu').html(seasonSelect);
    $('#jump-dialog #season-dropdown').dropdown();
    $('#jump-dialog #episode-dropdown .menu').html(episodeSelect);
    $('#jump-dialog #episode-dropdown').dropdown();
  }

  function updateEpisodeDropdown(episodeSelect) {
    $('#jump-dialog #episode-dropdown .menu').html(episodeSelect);
  }

  $('#series').on('click', '.jump-to-episode', function(e) {
    const showId = Number($(this).data('show-id'));
    const series = readSeries();
    const show = findShow(showId, series);
    const season = findCurrentSeason(show);
    const seasonSelect = getSeasonSelect(show);
    const episodeSelect = getEpisodeSelect(season);
    initDropdown(seasonSelect, episodeSelect);
    $('#jump-dialog')
      .modal({
        onDeny: function(){
          return true;
        },
        onApprove : function() {
          const [_, seasonNumber] = $('#jump-dialog input[name=season]').val().split('_');
          show.currentSeason = Number(seasonNumber);
          show.currentEpisode = Number($('#jump-dialog input[name=episode]').val());
          writeSeries(series);
          render();
        }
      })
      .modal('show');
  });

  $('#jump-dialog').on('change', 'input[name=season]', function(e) {
    const [showId, seasonNumber] = $(this).val().split('_');
    const show = findShow(Number(showId));
    const season = findSeason(show, Number(seasonNumber));
    const episodeSelect = getEpisodeSelect(season);
    updateEpisodeDropdown(episodeSelect);
  });

  render();
  window.addEventListener('storage', function(e) {
    render();
  });

  $('.my-popup').popup();
  $('.open-github').click(() => {
    window.open('https://twitter.com/OrKoN', '_blank');
  });
  $('.open-twitter').click(() => {
    window.open('https://twitter.com/OrKoN', '_blank');
  });
  $('.refreshr').click(() => {
    refreshSeries();
  });
});