#| title: "Uncertainty over time"
#| difficulty: "hard"
#| plot-types: "uncertainty, time series"
#| dataset-name: "pedestrians"
#| description: "Visualising uncertainty in pedestrian counts over a 24-hour period using gradient intervals from the `distributional` package. The dataset contains pedestrian counts and their standard errors for each hour of the day."
#| colours: "`#20794D`"


library(ggplot2)
library(ggdist)
library(distributional)

pedestrians <- structure(list(Time = 0:23, Count = c(34, 15, 13, 6, 23, 12, 
30, 37, 49, 71, 102, 106, 205, 145, 130, 165, 148, 90, 90, 56, 
76, 51, 38, 20), se = c(5.8309518948453, 3.87298334620742, 3.60555127546399, 
2.44948974278318, 4.79583152331272, 3.46410161513775, 5.47722557505166, 
6.08276253029822, 7, 8.42614977317636, 10.0995049383621, 10.295630140987, 
14.3178210632764, 12.0415945787923, 11.4017542509914, 12.8452325786651, 
12.1655250605964, 9.48683298050514, 9.48683298050514, 7.48331477354788, 
8.71779788708135, 7.14142842854285, 6.16441400296898, 4.47213595499958
)), row.names = c(NA, -24L), class = c("tbl_df", "tbl", "data.frame"
))


p <- ggplot(
        pedestrians, 
        aes(
            x=Time,
            ydist=distributional::dist_normal(Count, se)
        )) +
        stat_gradientinterval(colour = NA, fill="#20794D", 
    .width=1) +
    geom_line(aes(x=Time, y=Count), colour="#20794D") +
    xlab("Hour") + ylab("Count") +
    theme_bw()

print(p)
